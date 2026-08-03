# mcp-mhw

MHW MCP — Monster Hunter World data (mhw-db.com, free, no auth)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1395+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `get_monsters` | Search Monster Hunter World monsters by name, species, or size class. Returns species classification, elements, ailments, and weaknesses to plan hunts. |
| `get_weapons` | Browse Monster Hunter World weapons by type (e.g., \'Great Sword\', \'Bow\', \'Hammer\'). Returns damage, elements, and rarity to match your playstyle. |
| `get_armor` | Find Monster Hunter World armor by rank and type. Returns defense, elemental resistances, and skill slots for building effective sets. |
| `get_skills` | Look up Monster Hunter World skills by name. Returns descriptions, max ranks, and level-by-level effects to optimize your build. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "mhw": {
      "url": "https://gateway.pipeworx.io/mhw/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1395+ data sources:

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
ask_pipeworx({ question: "your question about Mhw data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [All tools and guides](https://github.com/pipeworx-io/examples)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
