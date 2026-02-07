# bugherd-mcp: agent index

## Entrypoints

### Admin MCP server

- CLI/bin: `bugherd-admin-mcp`
- Node entrypoint: `dist/bugherd-admin-mcp.js`
- Source: `src/bugherd-admin-mcp.ts`
- Modes:
  - stdio (default)
  - HTTP/SSE when `PORT` is set

### Project worker MCP server (project-scoped)

- CLI/bin: `bugherd-project-worker-mcp`
- Node entrypoint: `dist/bugherd-project-worker-mcp.js`
- Source: `src/bugherd-project-worker-mcp.ts`

- Scope:
  - fixed project via `BUGHERD_PROJECT_ID`
  - bot identity via `BUGHERD_BOT_USER_ID`

## Documentation

- Overview + setup: `README.md`
- Transport details (stdio vs HTTP/SSE): `TRANSPORT.md`

## Build

- `npm run build` (emits `dist/*`)

## Env (project worker)

Required:

- `BUGHERD_API_KEY`
- `BUGHERD_PROJECT_ID`
- `BUGHERD_BOT_USER_ID`

Optional:

- `BUGHERD_PAGE_SIZE`
- `BUGHERD_DESCRIPTION_MAX_CHARS`
- `BUGHERD_AGENT_SIGNATURE`
- `BUGHERD_AGENT_SIGNATURE_SEPARATOR`
- `BUGHERD_ACTIVE_COLUMN_IDS` (comma-separated ids)

BugHerd API limit: comment text max is 2000 chars.

All env vars are validated locally at startup (see `src/config.ts`).

## mcp-cmd: practical usage

### Key gotcha

- `mcp-cmd start ...` does not reliably inherit your current shell env.
- Pass variables explicitly via `--env`.
- Also pass `--cwd` to avoid path surprises.

### Start (project worker)

```bash
mcp-cmd start bugherd-project-worker node dist/bugherd-project-worker-mcp.js \
  --cwd /path/to/bugherd-mcp \
  --env BUGHERD_API_KEY=$BUGHERD_API_KEY \
  --env BUGHERD_PROJECT_ID=$BUGHERD_PROJECT_ID \
  --env BUGHERD_BOT_USER_ID=$BUGHERD_BOT_USER_ID \
  --env BUGHERD_PAGE_SIZE=${BUGHERD_PAGE_SIZE:-30}
```

### Introspect tools

```bash
mcp-cmd tools bugherd-project-worker
```

### Call a tool

Pass JSON args as a single string:

```bash
mcp-cmd call bugherd-project-worker tasks_list '{"sort":"api","scope":"taskboard"}'
mcp-cmd call bugherd-project-worker task_get '{"local_task_id":123}'
```

### Cursors for long text

- Use `next_cursor` returned by the tool.
- For debugging you can also pass a numeric cursor:

```bash
mcp-cmd call bugherd-project-worker task_description_more '{"local_task_id":123,"cursor":0}'
```

If you see `Unexpected end of JSON input`, you likely passed an invalid cursor string.

### Stop

```bash
mcp-cmd stop bugherd-project-worker
```

### Debug running servers

```bash
mcp-cmd ps
mcp-cmd ps bugherd-project-worker
```
