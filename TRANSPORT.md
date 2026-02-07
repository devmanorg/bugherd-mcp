# Transport Configuration

## Current: Dual Mode (HTTP + stdio)

BugHerd MCP servers support two transport modes (admin and project worker):

### HTTP Mode (Shared - Recommended)

One server instance serves multiple Claude Code sessions.

```bash
# Start HTTP server on port 3003
PORT=3003 BUGHERD_API_KEY=your_key node dist/bugherd-admin-mcp.js

# Or use the startup script
~/.claude/scripts/start-shared-mcps.sh
```

**Endpoints:**

- `http://localhost:3003/sse` - SSE connection for MCP
- `http://localhost:3003/health` - Health check (returns session count)

**Claude Code config (~/.claude.json):**

```json
{
  "mcpServers": {
    "bugherd": {
      "type": "sse",
      "url": "http://localhost:3003/sse"
    }
  }
}
```

### Project worker

Project worker server supports the same transports.

- Entrypoint: `dist/bugherd-project-worker-mcp.js`
- Extra env: `BUGHERD_PROJECT_ID`, `BUGHERD_BOT_USER_ID`

### stdio Mode (Default)

One process per Claude Code session (original behavior).

```bash
# Run in stdio mode (no PORT env var)
BUGHERD_API_KEY=your_key node dist/bugherd-admin-mcp.js
```

**Claude Code config (~/.claude.json):**

```json
{
  "mcpServers": {
    "bugherd": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/dist/bugherd-admin-mcp.js"],
      "env": {
        "BUGHERD_API_KEY": "your_key"
      }
    }
  }
}
```

## Why HTTP Mode?

- **Reduces processes:** 11 Claude sessions = 1 BugHerd process (vs 11)
- **Same security:** localhost only, no external access
- **Same functionality:** All tools work identically (stateless API calls)
- **Better resource usage:** Less CPU/RAM overhead

## Rollback to stdio-only

If you need to revert to stdio-only mode:

1. Remove the `PORT` environment variable
2. Update Claude Code config to use stdio:
   ```json
   "bugherd": {
     "type": "stdio",
     "command": "node",
     "args": ["/path/to/dist/bugherd-admin-mcp.js"],
     "env": {
       "BUGHERD_API_KEY": "your_key"
     }
   }
   ```

## Session Isolation

HTTP mode maintains **complete session isolation**:

- Each SSE connection gets a unique session ID
- Sessions don't share state
- All tools are stateless (API calls to BugHerd)

---

**Last Updated:** 2026-01-28
