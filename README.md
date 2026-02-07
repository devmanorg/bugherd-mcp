# BugHerd MCP Servers

MCP (Model Context Protocol) servers for working with BugHerd from AI clients.

This repo ships two entrypoints:

## Admin server: `bugherd-admin-mcp`

- Broad BugHerd API v2 coverage (projects, tasks, columns, comments, attachments, webhooks)
- Transports: stdio (default) and HTTP/SSE (shared mode)
- Includes destructive operations (delete project/attachment/webhook)

Transport details: see `TRANSPORT.md`.

## Project worker server: `bugherd-project-worker-mcp`

Designed for an AI client that operates inside a single project.

- Project scope is fixed by `BUGHERD_PROJECT_ID` (the client never needs it)
- Only a small, task-focused tool surface
- No tools for projects/users/attachments/webhooks
- Task updates are limited to status moves only
- Output is truncated to reduce context overflow

### Project worker tools

- `columns_list` — list project columns with `id` and `name`
- `tasks_list` — list tasks (max `BUGHERD_PAGE_SIZE` per call) + pagination cursors
- `task_get` — task details by `local_task_id` (description chunk + `description_next_cursor`)
- `task_description_more` — aux: read long description in chunks (`next_cursor`)
- `task_move_status` — move task to a column by `to_column_id`
- `comments_list` — list comments (max `BUGHERD_PAGE_SIZE` per call) + pagination cursors
- `comment_text_more` — aux: read long comment text in chunks (`next_cursor`)
- `comment_add` — add a comment as `BUGHERD_BOT_USER_ID`

### Project worker resources

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

### Admin server (stdio)

```json
{
  "mcpServers": {
    "bugherd": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/bugherd-mcp/dist/bugherd-admin-mcp.js"],
      "env": {
        "BUGHERD_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Project worker server (stdio)

```json
{
  "mcpServers": {
    "bugherd": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/bugherd-mcp/dist/bugherd-project-worker-mcp.js"],
      "env": {
        "BUGHERD_API_KEY": "your-api-key",
        "BUGHERD_PROJECT_ID": "your-project-id-here",
        "BUGHERD_BOT_USER_ID": "your-bot-user-id-here",
        "BUGHERD_PAGE_SIZE": "30",
        "BUGHERD_DESCRIPTION_MAX_CHARS": "4000",
        "BUGHERD_COMMENT_MAX_CHARS": "2000",
        "BUGHERD_AGENT_SIGNATURE": "",
        "BUGHERD_AGENT_SIGNATURE_SEPARATOR": "\\n\\n---\\n",
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
bun run src/bugherd-admin-mcp.ts
bun run src/bugherd-project-worker-mcp.ts
```
