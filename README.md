# mcp-metabolights

MetaboLights MCP — EBI's metabolomics study repository.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_studies` | Search EBI MetaboLights, the metabolomics (metabolite / small-molecule) study repository, by keyword — disease, metabolite, organism, or analytical technique (e.g. "diabetes", "glucose NMR", "Homo sapiens LC-MS"). Returns matching study accessions (e.g. MTBLS1) with name and a short description. |
| `get_study` | Fetch metadata for a single MetaboLights study by its accession (e.g. "MTBLS1"): title, full description, and the organisms studied (species + tissue/part). Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "metabolights": {
      "url": "https://gateway.pipeworx.io/metabolights/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Metabolights data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
