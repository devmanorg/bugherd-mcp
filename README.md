# BugHerd MCP Servers

MCP (Model Context Protocol) servers for working with BugHerd from AI clients.

This repo ships two entrypoints:

## Full server: `bugherd-mcp`

- Broad BugHerd API v2 coverage (projects, tasks, columns, comments, attachments, webhooks)
- Transports: stdio (default) and HTTP/SSE (shared mode)
- Includes destructive operations (delete project/attachment/webhook)

Transport details: see `TRANSPORT.md`.

## Restricted server: `bugherd-mcp-restricted`

Designed for an AI client that must operate inside a single project.

- Project scope is fixed by `BUGHERD_PROJECT_ID` (the client never needs it)
- Only a small, task-focused tool surface
- No tools for projects/users/attachments/webhooks
- Task updates are limited to status moves only
- Output is truncated to reduce context overflow

### Restricted tools

- `columns_list` — list project columns with `id` and `name`
- `tasks_list` — list tasks (max 30 per call) + pagination cursors
- `task_get` — task details by `local_task_id` (description truncated)
- `task_description_more` — aux: read long description in chunks (`next_cursor`)
- `task_move_status` — move task to a column by `to_column_id`
- `comments_list` — list comments (max 30 per call) + pagination cursors
- `comment_text_more` — aux: read long comment text in chunks (`next_cursor`)
- `comment_add` — add a comment as `BUGHERD_BOT_USER_ID`

### Restricted resources

- `bugherd://columns` — JSON with columns and config hints

## Installation

Prereqs:

- Node.js 18+ or Bun
- BugHerd API key (`BUGHERD_API_KEY`)

Install and build:

```bash
npm ci
npm run build
```

## Configuration

### Full server (stdio)

```json
{
  "mcpServers": {
    "bugherd": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/bugherd-mcp/dist/index.js"],
      "env": {
        "BUGHERD_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Restricted server (stdio)

```json
{
  "mcpServers": {
    "bugherd": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/bugherd-mcp/dist/restricted.js"],
      "env": {
        "BUGHERD_API_KEY": "your-api-key",
        "BUGHERD_PROJECT_ID": "12345",
        "BUGHERD_BOT_USER_ID": "67890",
        "BUGHERD_DESCRIPTION_MAX_CHARS": "4000",
        "BUGHERD_COMMENT_MAX_CHARS": "2000",
        "BUGHERD_ACTIVE_COLUMN_IDS": ""
      }
    }
  }
}
```

Notes:

- `BUGHERD_ACTIVE_COLUMN_IDS` is an optional comma-separated hint/filter (e.g. `"10,11,12"`).
- `tasks_list.sort` is required. Sorting is applied within the fetched page.

## Development

```bash
bun run src/index.ts
bun run src/restricted.ts
```
