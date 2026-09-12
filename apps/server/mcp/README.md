# @genfeedai/mcp

Genfeed's MCP server (`https://mcp.genfeed.ai/mcp`). A stateless Streamable
HTTP transport (`src/services/streamable-http.service.ts`) that fronts the
main API's `@genfeedai/actions` tool catalog for MCP clients (Claude Code,
Codex, ChatGPT, etc.), plus a REST mirror (`GET /v1/tools`, `GET
/v1/resources`) and a server-rendered setup page at `/`.

## Local development

Run from the repo root:

```bash
bun run dev:backend         # or dev:backend:min for api + files + notifications
```

The MCP server listens on port `3014` (see the workspace root `CLAUDE.md` for
the full port table).

## Toolsets

`tools/list` can return ~120 tools (tens of thousands of tokens), which is
more than most MCP clients need to load per connection. Callers can narrow
the advertised tool set with a `?toolsets=` query parameter on the `/mcp`
endpoint:

```
https://mcp.genfeed.ai/mcp?toolsets=content,generation
```

- **Comma-separated, kebab-case names** — see `getToolsets('mcp')` (exported
  from `@genfeedai/actions`) for the live list, or call the `list_toolsets`
  meta tool once connected.
- **`core` is always included** and cannot be excluded — it holds the
  discovery meta tools (`list_toolsets`, `search_tools`, `describe_tool`) plus
  a handful of always-needed account/status tools.
- **Omitting the parameter (or passing an empty value) returns every tool** —
  this is the default, unchanged behavior for existing clients.
- **An unknown toolset name is rejected with an HTTP 400** and a JSON-RPC
  `-32602` error naming the valid toolsets, before authentication runs (so it
  also applies to the unauthenticated public `tools/list` discovery path).
- The REST mirror (`GET /v1/tools`) accepts the same `?toolsets=` parameter.
- **`tools/call` is unaffected** — a tool outside the current `tools/list`
  selection can still be invoked directly. Toolsets only shape discovery, not
  authorization (role-based access control is unchanged and still
  authoritative).

### Tool discovery meta tools

Because `tools/list` can be narrowed, three read-only meta tools (always
in the `core` toolset) help a client find something outside its current
selection so it can reconnect with a broader `?toolsets=`:

- `list_toolsets` — every toolset available on this server, with tool counts.
- `search_tools` — case-insensitive substring search over tool name,
  description, and toolset (`{ query?, toolset?, limit? }`, at least one of
  `query`/`toolset` required).
- `describe_tool` — the full tool definition for one name (`{ name }`),
  including the closest name matches when the name is not found.

These search the full, role-filtered catalog regardless of the caller's
current toolset selection — they are for discovering what else exists, not
just what is currently loaded.

### Setup page

The setup page at `/` renders a toolset picker (checkboxes, `core` checked
and disabled) that rewrites the displayed endpoint, its copy button, and the
Claude Code / Codex / AI-prompt snippets to include the selected toolsets —
so copying a snippet after picking toolsets connects with exactly that
selection.

## Tests

Run from the repo root (see the workspace root `CLAUDE.md` for the required
verification host):

```bash
bun run test --filter=@genfeedai/mcp
bunx turbo run type-check --filter=@genfeedai/mcp
```
