# BugHerd MCP Servers

MCP (Model Context Protocol) servers for working with BugHerd from AI clients.

This repo ships two entrypoints:

## Admin server: `bugherd-admin-mcp`

- Broad BugHerd API v2 coverage (projects, tasks, columns, comments, attachments, webhooks)
- Transports: stdio (default) and HTTP/SSE (shared mode)
- Includes destructive operations (delete project/attachment/webhook)

Transport details: see below (stdio vs HTTP/SSE).

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
- `task_description_more` — aux: read long description in chunks (`next_cursor` or numeric `offset`)
- `task_move_status` — move task to a column by `to_column_id`
- `comments_list` — list comments (max `BUGHERD_PAGE_SIZE` per call) + pagination cursors
- `comment_add` — add a comment as `BUGHERD_BOT_USER_ID` (max 2000 chars)

### Project worker resources

- `bugherd://columns` — JSON with columns and config hints

## Installation

Prereqs:

- Node.js 18+
- BugHerd API key (`BUGHERD_API_KEY`)

### Recommended: Use `npx` (no install)

This runs the package and executes the CLI from its `bin` entry.

```bash
# Admin server (from npm)
BUGHERD_API_KEY=your-api-key npx -p bugherd-mcp bugherd-admin-mcp

# Admin server (directly from GitHub)
BUGHERD_API_KEY=your-api-key \
  npx -p git+https://github.com/devmanorg/bugherd-mcp.git bugherd-admin-mcp

# Project worker server (from npm)
BUGHERD_API_KEY=your-api-key \
BUGHERD_PROJECT_ID=123 \
BUGHERD_BOT_USER_ID=456 \
npx -p bugherd-mcp bugherd-project-worker-mcp

# Project worker server (directly from GitHub)
BUGHERD_API_KEY=your-api-key \
BUGHERD_PROJECT_ID=123 \
BUGHERD_BOT_USER_ID=456 \
npx -p git+https://github.com/devmanorg/bugherd-mcp.git bugherd-project-worker-mcp
```

### Option B: Install locally (dev)

```bash
npm ci
npm run build
```

### Option C: Install globally

```bash
npm i -g bugherd-mcp
# or from this repo:
# npm i -g .

BUGHERD_API_KEY=your-api-key bugherd-admin-mcp
```

## Configuration

Recommended: run via `npx` so you don't need local paths.

### Admin server (stdio)

From npm:

```json
{
  "mcpServers": {
    "bugherd": {
      "type": "stdio",
      "command": "npx",
      "args": ["-p", "bugherd-mcp", "bugherd-admin-mcp"],
      "env": {
        "BUGHERD_API_KEY": "your-api-key"
      }
    }
  }
}
```

Directly from GitHub:

```json
{
  "mcpServers": {
    "bugherd": {
      "type": "stdio",
      "command": "npx",
      "args": ["-p", "git+https://github.com/devmanorg/bugherd-mcp.git", "bugherd-admin-mcp"],
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
      "command": "npx",
      "args": ["-p", "bugherd-mcp", "bugherd-project-worker-mcp"],
      "env": {
        "BUGHERD_API_KEY": "your-api-key",
        "BUGHERD_PROJECT_ID": "your-project-id-here",
        "BUGHERD_BOT_USER_ID": "your-bot-user-id-here",
        "BUGHERD_PAGE_SIZE": "30",
        "BUGHERD_DESCRIPTION_MAX_CHARS": "4000",
        "BUGHERD_AGENT_SIGNATURE": "",
        "BUGHERD_AGENT_SIGNATURE_SEPARATOR": "\\n\\n---\\n",
        "BUGHERD_ACTIVE_COLUMN_IDS": ""
      }
    }
  }
}
```

Alternative (local build): set `command` to `node` and point `args` at `dist/*.js`.

Notes:

- `BUGHERD_ACTIVE_COLUMN_IDS` is an optional comma-separated hint/filter (e.g. `"10,11,12"`).
- `tasks_list.sort` is required. Sorting is applied within the fetched page.

## Transport

Both servers support:

- **stdio** (default): no `PORT` env var; one process per client session
- **HTTP/SSE**: set `PORT`; one long-lived server can serve multiple sessions

Health endpoint (HTTP mode): `GET /health`

## Development

Install deps:

```bash
npm ci
```

Run with auto-reload on changes:

```bash
npm run dev:mcp:admin
npm run dev:mcp:project-worker
```

HTTP/SSE mode (handy for debugging):

```bash
npm run dev:mcp:admin:http
npm run dev:mcp:project-worker:http
```
