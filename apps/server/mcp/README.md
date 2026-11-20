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
bun run dev:backend:min     # API, files, notifications, and workers
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
local operation does not bypass authentication or tenant isolation. The list is the same on every connection.

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

## Tools

Every connection lists every tool its role may call, at most `MCP_TOOL_CAP`
(30) for the ordinary role; CI fails on overflow. `?toolsets=`, `?profile=` and
`?app=` are no longer read: a URL that still carries them connects and gets the
same list, and the REST mirror (`GET /v1/tools`) returns the same catalog.
Compact output schemas and bounded readable results reduce serialized payload
size; model-token savings depend on the client. See the
[token benchmark](TOKEN_BENCHMARK.md) for measurements and reproduction.

- **Most tools take `action` and one `input` object.** The catalog is
  `MCP_CATALOG_TOOLS` in `packages/actions`; the original tools stay the
  executors and are never listed. A retired tool name fails at once and names its
  replacement.
- **Every tool declares an `organization` argument.** On a connection covering
  several organizations a call that names none is refused with the list of
  organizations and their brands (`organization_required`); a connection limited
  to one organization works inside it and refuses a named one. There is no stored
  default and no `switch_org`.
- **`tools/call` permissions are unchanged.** Role-based access control and
  approvals stay authoritative.

### Brand campaigns

`save_post` with `action: campaign` handles native campaign context and
Library asset membership. `check_channel` covers publishing readiness and
`schedule_release` approved scheduling; every connection lists them. Follow [Brand campaigns through MCP](../../../docs/brand-campaign-mcp.md)
for the complete context → asset → release workflow.

### Tool discovery

`find_tools { name?, query?, limit? }` is read-only. No arguments lists every
tool with its actions; `query` searches tool names, descriptions and action
names (a retired tool name finds the tool that replaced it); `name` returns one
tool's full definition. Discovery does not install a tool into the client's
callable list: if a listed tool is missing in the client, refresh its MCP tool
list or reconnect to the same server URL.

The transport is stateless and does not send tool/resource list-change
notifications. Its discovery and setup examples both advertise `listChanged:
false`; clients need a fresh discovery after server upgrades or scope changes.

## Tests

Run in the checkout on Mac Studio:

```bash
bun run --cwd apps/server/mcp test
bunx turbo run type-check --filter=@genfeedai/mcp --concurrency=1
```
