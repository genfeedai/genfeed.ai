# Desktop App

`apps/desktop` is the Electron native shell for the macOS-first installed app release. It runs the real `apps/web` Next.js frontend and provides native actions (session, server picker, terminal, agent CLIs) through typed IPC.

There is no desktop-local React/Next.js renderer. Development and release builds
run the canonical `apps/web` codebase, while Electron owns native lifecycle,
sign-in, server selection, the terminal, the Claude Code / Codex agent runtime,
tray, and updates.

Desktop always talks to a Genfeed server: Genfeed Cloud or the self-hosted
server picked in Desktop. Generation, credits and the Library stay on that
server; Desktop adds access to the CLIs and tools on this computer. It has no
local database and runs no local generation. The local workspace mode that
earlier builds carried was removed in #11460. A `desktop-v0.1.2` install may
still hold its `pglite-db` folder and `.genfeed` workspace files; current builds
leave them on disk untouched.

Installed builds auto-update through `electron-updater`. The feed is the
generic provider configured in `package.json` `build.publish`: the assets of
the rolling `desktop-latest` GitHub release, which `desktop-release.yml`
replaces on every `desktop-v*` tag. Dev and smoke runs never check for updates.
Builds shipped before the generic feed existed (`0.1.1` and older) pointed at
`/releases/latest`, which resolves to the web app release and never to a
desktop release, so they cannot update themselves and must be reinstalled once.

Installed builds load the HTTPS app origin derived from
`GENFEED_DESKTOP_AUTH_URL` first, then start the bundled app shell on
`http://127.0.0.1:3230` when the hosted app is unavailable. A fresh source
checkout still runs the bundled shell directly, and a downloaded desktop build
never requires cloning this repository.

## Development

```bash
cd apps/desktop
bun install
bun run dev
```

Environment variables:

- `GENFEED_DESKTOP_API_URL` (optional): API of the default server. Installed and release builds default to `https://api.genfeed.ai/v1`; the dev script explicitly uses `http://localhost:3010/v1` unless this variable is set.
- `GENFEED_DESKTOP_APP_URL` (optional): external app shell URL for development. When unset, desktop starts/uses its embedded app shell on `http://127.0.0.1:3230`.
- `GENFEED_DESKTOP_AUTH_URL` (optional): defaults to `https://app.genfeed.ai/oauth/cli`
- `GENFEED_DESKTOP_WS_URL` (optional): defaults to `https://notifications.genfeed.ai`
- `GENFEED_DESKTOP_MCP_URL` (optional): Genfeed MCP endpoint used by the local
  Claude Code / Codex agent runtime. Defaults to `https://mcp.genfeed.ai/mcp`
  for Genfeed Cloud and is derived from the API URL for other servers. Every
  connection lists every tool, so the URL carries no selection.
- `GENFEED_DESKTOP_SENTRY_DSN` (optional): enables desktop runtime and renderer telemetry
- `GENFEED_DESKTOP_SENTRY_ENVIRONMENT` (optional): defaults to `NODE_ENV` or `development`
- `GENFEED_DESKTOP_RELEASE` (optional): explicit release identifier for telemetry and packaged builds
- `GENFEED_DESKTOP_APP_PORT` (optional): loopback port for the embedded app;
  defaults to `3230`

The `GENFEED_DESKTOP_*_URL` variables only set the **default** server. A
server picked in-app (see [Server selection](#server-selection)) takes
precedence.

The hosted `apps/web` runtime accepts
`GENFEED_DESKTOP_MINIMUM_VERSION` (default `0.1.0`). Desktop requests below
that semantic version receive HTTP `426` before the app shell renders; ordinary
web requests are unaffected.

From the repository root:

```bash
bun run dev:desktop
```

`bun run dev:desktop` builds the Electron main/preload bundle, starts the embedded
`apps/web` Next.js shell, and launches Electron. It does not start the NestJS
API. Browser API requests stay same-origin on the loopback shell: `apps/web`
calls `/v1`, and its baked Next.js rewrite proxies that path to the configured
real API origin. This keeps the Better Auth cookie scoped to the shell origin.

Genfeed Connect sign-in opens the system browser with PKCE. The callback returns
through `genfeedai-desktop://auth`; Electron exchanges the code for a main-only
`gf_` API key and an exact signed Better Auth session cookie. Electron stores
both together using the small encrypted session store and installs the
HttpOnly cookie as a host-only cookie on the selected app origin. The API key is
never exposed to `apps/web`; main only adds it to trusted shell requests as
`x-genfeed-desktop-token`. Every trusted shell request also carries the app
version so the hosted app can require a safe minimum version. Sign-out removes
the cookie and key together.

The first visible desktop paint is owned by Electron, not by `apps/web`: a black
launch screen with an animated Genfeed mark is shown while the selected app
shell boots. If neither shell can start, Electron keeps the same black surface
and shows a short failure message instead of exposing an unstyled renderer.

Generation runs on the selected Genfeed server after sign-in. Users without
provider keys use Genfeed credits; the server owns provider credentials and
billing.

To test cloud or self-hosted API paths, run the backend separately and point the
desktop app at it:

```bash
bun run dev:backend:min
GENFEED_DESKTOP_API_URL=http://localhost:3010/v1 bun run dev:desktop
```

For a hosted setup, use the hosted API URL instead:

```bash
GENFEED_DESKTOP_API_URL=https://api.genfeed.ai/v1 bun dev:desktop
```

## Server selection

Settings → Organization → Integrations shows a **Genfeed server** card in
Desktop. Pick **Genfeed Cloud** (`https://api.genfeed.ai/v1`) or
**Self-hosted** and enter the server's API URL (a bare origin gets `/v1`).
App, MCP, and notifications URLs are optional and derive from the API URL:

- `api.example.com` → `app.` / `mcp.` (`/mcp`) / `notifications.` subdomains
- `host:3010` (the self-hosted image) → ports `3000` / `3014` / `3011`
- anything else → the API origin (single-origin reverse proxy)

**Test connection** calls the API's public `GET /v1/health`. Plain `http://` is
accepted only for this computer and private-network hosts, because the desktop
`gf_` key would otherwise travel in clear text.

Switching asks for a native confirmation, then Desktop restarts on the new
server so every consumer is rebuilt from one resolved profile: the app shell
and its `/v1` proxy, the session/`gf_` key, the cloud API client, the
notifications socket (injected through the preload as
`__GENFEED_DESKTOP_ENV__.wsEndpoint`), the CLI agent's MCP endpoint, and the
system-browser sign-in URL. The choice is stored encrypted (Electron
`safeStorage`) in `desktop-state.json`.

Sign-in credentials are stored only when the OS keychain can encrypt them.
Where there is none (for example Linux without a keyring), Desktop refuses to
sign in instead of writing them in plaintext; set
`GENFEED_DESKTOP_ALLOW_PLAINTEXT_STORAGE=1` to opt back in.

Each server keeps its **own** encrypted session and `gf_` key
(`desktop.session` for Cloud, `desktop.session.<server-id>` for self-hosted),
so switching never signs you out of the other server; only the shell cookie
jar is swapped.

The bundled shell (`127.0.0.1:3230`) bakes its `/v1` rewrite at build time, so
Desktop fronts it with a small loopback proxy that sends `/v1/*` to the
selected API and everything else to the bundled Next server on a private port.
An HTTPS self-hosted app URL is loaded as the remote shell in installed builds,
like `app.genfeed.ai` for Cloud. With `GENFEED_DESKTOP_APP_URL` (the `next dev`
shell used by `bun run dev:desktop`) the dev server owns `/v1`, so switching
servers there also needs `GENFEED_DESKTOP_API_URL` for the dev shell.

## Agent on your Claude Code or Codex subscription

In Desktop, the agent can run each turn on the user's **own** Claude Code or
Codex CLI instead of the hosted model. Threads, brand context, and memory stay
in Genfeed (Cloud or self-hosted); the model turn costs no Genfeed credits.
It needs no local workspace or local backend.

Setup:

1. Install and sign in to a CLI on this computer:
   - Claude Code: `npm install -g @anthropic-ai/claude-code`, then
     `claude auth login` (Claude Code 2.x with `--tools` support)
   - Codex: `npm install -g @openai/codex`, then `codex login`
2. Sign in to Genfeed in Desktop.
3. In the agent composer (or the agent panel header), open the runtime picker
   and choose **Claude Code** or **Codex**. The picker lists a CLI only when
   Desktop detects its binary; the composer states
   "Runs on your Claude Code subscription — no Genfeed credits".

How a turn runs (`src/main/cli-agent-runtime.service.ts`):

- The renderer sends the prompt over IPC (`window.genfeedDesktop.agentRuntime`);
  main validates it and creates the Genfeed thread when needed
  (`POST /v1/agent/threads` with `runtimeKey` and `source: desktop-cli`).
- Claude Code: `claude -p --output-format stream-json --verbose
  --include-partial-messages --mcp-config <file> --strict-mcp-config
  --allowedTools mcp__genfeed --tools "" --append-system-prompt <prompt>
  [--resume <session>]`, prompt on stdin. Built-in file/shell tools are
  removed; only Genfeed MCP tools are pre-approved; permissions are never
  bypassed. The MCP config holding the `gf_` key is written `0600` inside a
  `0700` directory under the Electron userData dir and deleted after the turn
  (stale files are swept at startup).
- Codex: `codex exec --json --skip-git-repo-check --sandbox read-only
  -c approval_policy="never" -c mcp_servers.genfeed.url=...
  -c mcp_servers.genfeed.bearer_token_env_var="GENFEED_API_KEY"
  [resume <session>] -`, prompt on stdin. The key reaches Codex only through
  the child's environment. Codex has no append-system-prompt flag, so the
  Genfeed instructions open the first message of a thread and persist across
  `codex exec resume`.
- The system prompt names the org/brand/thread and requires the
  `get_brand_context` MCP tool first in a new thread, then Genfeed MCP tools
  for every Genfeed action.
- Streamed JSON is normalized (session, text deltas, tool call
  started/finished with a redacted argument summary, usage, completed/error)
  and sent to the renderer, which renders it with the standard message and
  tool-call UI.
- The finished turn is saved with `POST /v1/agent/threads/:id/external-turns`
  (user + assistant message, tool summaries, usage, runtime key, CLI session
  id). The API records it without reserving Genfeed credits and keeps the
  session id in `AgentThread.config.externalRuntime`, so the next turn
  resumes the same CLI session.
- Stop kills the whole process tree; turns time out after 15 minutes or
  5 minutes without output. A missing binary or signed-out CLI produces an
  actionable message (`claude auth login` / `codex login`).

Genfeed tools that generate media or publish still spend Genfeed credits; only
the model turn moves to the user's subscription. Attachments are not sent to
CLI runtimes yet. The Grok CLI is detected but not offered as a runtime: it has
no stable headless JSON event stream to drive and parse.

## Terminal

The agent panel terminal (Shell, Genfeed CLI, Claude CLI, Codex CLI) uses
`node-pty` in Electron main through `window.genfeedDesktop.terminal`. Sessions
start only when picked from **New**; the first one per launch asks for a native
confirmation, because the shell origin is remote. The browser/self-hosted web build keeps the socket.io terminal
gateway.

The Genfeed CLI session starts `gf` through a small wrapper
(`src/main/genfeed-cli-launch.util.ts`). When `gf` is missing it prints
`npm install -g @genfeedai/cli` and leaves a shell open; otherwise it reports
whether `gf auth status` is signed in and then starts the CLI. The CLI keeps
its own login in `~/.gf/config.json`; Desktop does not hand it its session
(#11287).

## Platform admin

`/admin` is not part of the Desktop app shell. `scripts/build-app-shell.cjs`
moves `apps/web/app/(protected)/admin` aside for the one `next build` and puts
it back afterwards (`scripts/exclude-desktop-routes.cjs`). Only platform
superadmins use it, it was about 20 MiB of the 150 MiB shell budget, and it
stays reachable in the browser. `verify:bundle-size` fails if it leaks back in,
and fails any route whose client-reference manifest passes 512 KiB (#11280,
#11282).

## API Runtime Boundary

The desktop app embeds the app shell, not the full NestJS API. The full API
requires its own process and operational dependencies such as the database,
queues, workers, provider keys, and integration callbacks. Desktop talks to one
of two servers:

- self-hosted API: `GENFEED_DESKTOP_API_URL=http://localhost:3010/v1` or a
  self-hosted domain
- Genfeed Cloud API: default, or
  `GENFEED_DESKTOP_API_URL=https://api.genfeed.ai/v1`

Do not make a downloaded desktop app require a local clone of the API, and do
not add local generation to Desktop: generation stays behind the server's REST
API (owner decision, 26 November 2026, #11460).

## Release

```bash
cd apps/desktop
bun run qa:release
bun run release:mac
```

`bun run qa:release` is the release-candidate gate for desktop changes. It runs
desktop lint, type-check, Bun tests, and the Electron smoke boot used by the
`Desktop QA` workflow. Use the checklist in
[`apps/desktop/RELEASE_QA.md`](./RELEASE_QA.md) for manual release evidence.

`bun run release:mac` writes macOS artifacts into `apps/desktop/release/`
and creates `genfeed-desktop-release.json` beside them. The manifest records the
package version, commit, release channel, artifact names, file sizes, SHA-256
digests, signing inputs, and notarization hook so downloaded artifacts can be
audited back to the desktop release workflow.

Optional signing and notarization environment variables:

- `APPLE_API_KEY` (absolute path to the App Store Connect `.p8` key)
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `DEVELOPER_ID_P12_BASE64`
- `DEVELOPER_ID_P12_PASSWORD`

## Current Scope

- Electron desktop shell embedding the real `apps/web` frontend
- No parallel desktop-local renderer or desktop-local Next.js configuration
- Active typed IPC for system-browser sign-in, Genfeed server selection, local terminals, and the Claude Code / Codex agent runtime
- Generation on the selected Genfeed server after sign-in
- macOS artifact generation via `electron-builder`, icon generation, and optional notarization hook
