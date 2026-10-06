# @genfeedai/mcp

Genfeed's MCP server (`https://mcp.genfeed.ai/mcp`). A stateless Streamable
HTTP transport (`src/services/streamable-http.service.ts`) that fronts the
main API's `@genfeedai/actions` tool catalog for MCP clients (Claude Code,
Codex, ChatGPT, etc.), plus a REST mirror (`GET /v1/tools`, `GET
/v1/resources`) and a server-rendered setup page at `/`.

## Local development

Run from the repo root:

```bash
bun run dev:setup           # once per machine: trusted Portless HTTPS proxy
bun run dev:backend:min     # API, files, and notifications
bun run dev:mcp             # MCP in a separate terminal
```

Use `https://mcp.genfeed.localhost/mcp`. Linked worktrees receive their own
branch-prefixed routes; `bun run dev:status` shows the actual endpoints.
The MCP process derives its API endpoint from the same Portless worktree
origin. Keep the API, database, Redis, and credentials scoped to development.

If the HTTPS proxy is unavailable, start MCP alone on a separate debug port:

```bash
MCP_PORT=3314 bun run --cwd apps/server/mcp dev:debug
```

This uses the fixed-port debugging environment rather than the interactive
HTTPS routes; do not mix the two environments. The explicit package entry and
port avoid the default debug-port collision tracked in
[issue #6317](https://github.com/genfeedai/genfeed.ai/issues/6317).

### Local QA scope

The public `tools/list`, `resources/list`, and card `resources/read` requests
can be inspected directly through a local MCP client. `initialize`, tool calls,
and tenant resources still require a valid development API session or API key;
local operation does not bypass authentication or tenant isolation. Select
`?profile=full` to inspect the complete curated MCP catalog.

Run the automated suites on the repository's designated verification host
(Mac Studio), including when the dev server runs on the MacBook. The MCP
package suite covers tool dispatch, approvals, role boundaries, media results,
the real HTTP/SDK transport, and the HTML preview renderer. This fixture-based
coverage does not prove that every external provider or publishing destination
works. Authenticated live generation and publishing checks need a development
tenant, appropriate provider credentials, and explicit authorization for any
cost or external effect. A local SDK client avoids the cloud connector's
production endpoint and cached tool list.

## Preview UI

The inline preview bundles the existing shared React UI components, including
Card, Button, Badge, Avatar, Collapsible, Dialog, Progress, Text and Heading.
The Tailwind stylesheet and CSP-compatible Satoshi font are shared product assets.
Widget layout uses shared utilities; it must not recreate component styling.

## Toolsets

`tools/list` can return ~120 tools (tens of thousands of tokens), which is
more than most MCP clients need to load per connection. Callers can narrow
the advertised tool set with a `?toolsets=` query parameter on the `/mcp`
endpoint:

```
https://mcp.genfeed.ai/mcp?toolsets=content,generation
```

- **Comma-separated, kebab-case names** — see `getToolsets('mcp')` (exported
  from `@genfeedai/actions`) for the live list, or call the `find_tools`
  meta tool once connected.
- **`core` is always included** and cannot be excluded — it holds the
  discovery meta tool (`find_tools`) plus
  a handful of always-needed account/status tools.
- **Omitting the parameter (or passing an empty value) uses `?profile=`**, and
  a bare URL gets the `default` profile: `core`, `generation`, `content` and
  `scheduler`, capped at 26 tools. Use `?profile=full` for every tool.
- **An unknown toolset name is rejected with an HTTP 400** and a JSON-RPC
  `-32602` error naming the valid toolsets, before authentication runs (so it
  also applies to the unauthenticated public `tools/list` discovery path).
- The REST mirror (`GET /v1/tools`) accepts the same `?toolsets=` parameter.
- **`tools/call` is unaffected** — a tool outside the current `tools/list`
  selection can still be invoked directly. Toolsets only shape discovery, not
  authorization (role-based access control is unchanged and still
  authoritative).

### Tool discovery meta tools

Because `tools/list` can be narrowed, one read-only meta tool (always in the
`core` toolset), `find_tools { name?, query?, toolset?, limit? }`, helps a
client find something outside its current selection so it can reconnect with
a broader `?toolsets=`:

- No arguments — every toolset available on this server, with tool counts.
- `query` and/or `toolset` — case-insensitive substring search over tool name,
  description, and toolset.
- `name` — the full tool definition for one name, including the closest name
  matches when the name is not found.

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

Run in the checkout on Mac Studio:

```bash
bun run --cwd apps/server/mcp test
bunx turbo run type-check --filter=@genfeedai/mcp --concurrency=1
```
