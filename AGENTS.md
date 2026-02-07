# bugherd-mcp: agent index

## Entrypoints

### Full MCP server

- CLI/bin: `bugherd-mcp`
- Node entrypoint: `dist/index.js`
- Source: `src/index.ts`
- Modes:
  - stdio (default)
  - HTTP/SSE when `PORT` is set

### Restricted MCP server (project-scoped)

- CLI/bin: `bugherd-mcp-restricted`
- Node entrypoint: `dist/restricted.js`
- Source: `src/restricted.ts`
- Scope:
  - fixed project via `BUGHERD_PROJECT_ID`
  - bot identity via `BUGHERD_BOT_USER_ID`

## Documentation

- Overview + setup: `README.md`
- Transport details (stdio vs HTTP/SSE): `TRANSPORT.md`

## Build

- `npm run build` (emits `dist/*`)

## Env (restricted)

Required:

- `BUGHERD_API_KEY`
- `BUGHERD_PROJECT_ID`
- `BUGHERD_BOT_USER_ID`

Optional:

- `BUGHERD_DESCRIPTION_MAX_CHARS`
- `BUGHERD_COMMENT_MAX_CHARS`
- `BUGHERD_ACTIVE_COLUMN_IDS` (comma-separated ids)

All env vars are validated locally at startup (see `src/config.ts`).

## mcp-cmd: practical usage

### Key gotcha

- `mcp-cmd start ...` does not reliably inherit your current shell env.
- Pass variables explicitly via `--env`.
- Also pass `--cwd` to avoid path surprises.

### Start (restricted)

```bash
mcp-cmd start bugherd-restricted node dist/restricted.js \
  --cwd /path/to/bugherd-mcp \
  --env BUGHERD_API_KEY=$BUGHERD_API_KEY \
  --env BUGHERD_PROJECT_ID=$BUGHERD_PROJECT_ID \
  --env BUGHERD_BOT_USER_ID=$BUGHERD_BOT_USER_ID
```

### Introspect tools

```bash
mcp-cmd tools bugherd-restricted
```

### Call a tool

Pass JSON args as a single string:

```bash
mcp-cmd call bugherd-restricted tasks_list '{"sort":"api","scope":"taskboard"}'
mcp-cmd call bugherd-restricted task_get '{"local_task_id":123}'
```

### Stop

```bash
mcp-cmd stop bugherd-restricted
```

### Debug running servers

```bash
mcp-cmd ps
mcp-cmd ps bugherd-restricted
```
