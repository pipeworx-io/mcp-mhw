# @pipeworx/mcp-mhw

MCP server for Monster Hunter World game data via [mhw-db.com](https://mhw-db.com/). Free, no authentication required.

## Tools

| Tool | Description |
|------|-------------|
| `get_monsters` | List monsters with type, species, elements, ailments, and weaknesses |
| `get_weapons` | List weapons, optionally filtered by weapon type |
| `get_armor` | List armor pieces with type, rank, defense, resistances, and slots |
| `get_skills` | List skills with descriptions and rank-level details |

## Quickstart via Pipeworx Gateway

```bash
curl -X POST https://gateway.pipeworx.io/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "mhw__get_monsters",
      "arguments": { "limit": 5 }
    },
    "id": 1
  }'
```

## License

MIT
