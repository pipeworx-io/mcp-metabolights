interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * MetaboLights MCP — EBI's metabolomics study repository.
 *
 * Keyword-search metabolomics (metabolite / small-molecule) studies by disease,
 * metabolite, organism, or technique, and fetch a study's title / description /
 * organisms. Keyless. Completes the EBI omics trio with Expression Atlas
 * (transcriptomics) and PRIDE (proteomics).
 *
 * Two upstream EBI services:
 *  - EBI Search (keyword search)  : https://www.ebi.ac.uk/ebisearch/ws/rest/metabolights
 *  - MetaboLights WS (study meta) : https://www.ebi.ac.uk/metabolights/ws
 */


const BASE_SEARCH = 'https://www.ebi.ac.uk/ebisearch/ws/rest/metabolights';
const BASE_WS = 'https://www.ebi.ac.uk/metabolights/ws';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_studies',
    description:
      'Search EBI MetaboLights, the metabolomics (metabolite / small-molecule) study repository, by keyword — disease, metabolite, organism, or analytical technique (e.g. "diabetes", "glucose NMR", "Homo sapiens LC-MS"). Returns matching study accessions (e.g. MTBLS1) with name and a short description.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text query, e.g. "type 2 diabetes urine NMR".' },
        limit: { type: 'number', description: 'Max studies to return (default 15, max 100).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_study',
    description:
      'Fetch metadata for a single MetaboLights study by its accession (e.g. "MTBLS1"): title, full description, and the organisms studied (species + tissue/part). Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'MetaboLights accession, e.g. "MTBLS1".' },
      },
      required: ['id'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'search_studies':
        return await searchStudies(args);
      case 'get_study':
        return await getStudy(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function searchStudies(args: Record<string, unknown>): Promise<unknown> {
  const query = reqStr(args, 'query');
  let limit = typeof args.limit === 'number' ? Math.floor(args.limit) : 15;
  if (!Number.isFinite(limit) || limit < 1) limit = 15;
  if (limit > 100) limit = 100;

  const url =
    `${BASE_SEARCH}?query=${encodeURIComponent(query)}&format=json&size=${limit}` +
    `&fields=${encodeURIComponent('name,description')}`;
  const data = (await getJson(url)) as {
    hitCount?: number;
    entries?: Array<{ id?: string; fields?: { name?: string[]; description?: string[] } }>;
  };

  const studies = (data.entries ?? []).map((e) => {
    const rawDesc = e.fields?.description?.[0] ?? '';
    return {
      id: e.id ?? '',
      name: e.fields?.name?.[0] ?? '',
      description: truncate(stripHtml(rawDesc), 300),
    };
  });

  return { hitCount: data.hitCount ?? studies.length, studies };
}

async function getStudy(args: Record<string, unknown>): Promise<unknown> {
  const id = reqStr(args, 'id').trim();
  const enc = encodeURIComponent(id);

  const [titleRes, descRes] = await Promise.all([
    getJsonSafe(`${BASE_WS}/studies/${enc}/title`),
    getJsonSafe(`${BASE_WS}/studies/${enc}/description`),
  ]);

  const title = (titleRes as { title?: string } | null)?.title;
  const rawDesc = (descRes as { description?: string } | null)?.description;

  if (titleRes == null && descRes == null) {
    return { error: 'study not found', id };
  }

  // Organisms are best-effort — tolerate failure / absence.
  let organisms: Array<{ organismName: string; organismPart: string }> | undefined;
  const orgRes = (await getJsonSafe(`${BASE_WS}/studies/${enc}/organisms`)) as
    | { organisms?: Array<Record<string, unknown>> }
    | null;
  if (orgRes && Array.isArray(orgRes.organisms)) {
    organisms = orgRes.organisms.map((o) => ({
      organismName: pickField(o, ['Characteristics[Organism]', 'organismName', 'organism']),
      organismPart: pickField(o, ['Characteristics[Organism part]', 'organismPart', 'organismPart']),
    }));
  }

  const out: Record<string, unknown> = { id };
  if (title != null) out.title = title;
  out.description = rawDesc != null ? stripHtml(rawDesc) : null;
  if (organisms) out.organisms = organisms;
  return out;
}

/** Pull the first present string value among candidate keys (ISA-Tab style or plain). */
function pickField(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) {
    const body = await res.text().then((t) => t.slice(0, 200)).catch(() => '');
    throw new Error(`MetaboLights: ${res.status} ${body}`);
  }
  return res.json();
}

/** Like getJson but returns null on any failure (non-2xx, network, bad JSON). */
async function getJsonSafe(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Strip HTML tags and decode a few common entities. */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + '…';
}

function reqStr(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing or empty.`);
  }
  return v;
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
