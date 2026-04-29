# Desktop App

`apps/desktop/app` is the Electron native shell for the macOS-first installed app release. It embeds the real `apps/app` Next.js frontend and provides desktop-local backend actions through typed IPC.

The desktop app must be useful by itself. A fresh source checkout can run the
desktop shell in local/offline mode without starting the NestJS API, and a
downloaded desktop build should not require cloning this repository.

## Development

```bash
cd apps/desktop/app
bun install
bun run dev
```

Environment variables:

- `GENFEED_DESKTOP_API_URL` (optional): API to use when cloud/self-hosted sync is enabled. Source builds default to `http://localhost:3010/v1`; official cloud builds may set this to `https://api.genfeed.ai/v1`.
- `GENFEED_DESKTOP_APP_URL` (optional): external app shell URL for development. When unset, desktop starts/uses its embedded app shell on `http://127.0.0.1:3230`.
- `GENFEED_DESKTOP_AUTH_URL` (optional): defaults to `https://app.genfeed.ai/oauth/cli`
- `GENFEED_DESKTOP_WS_URL` (optional): defaults to `https://notifications.genfeed.ai`
- `GENFEED_DESKTOP_SENTRY_DSN` (optional): enables desktop runtime and renderer telemetry
- `GENFEED_DESKTOP_SENTRY_ENVIRONMENT` (optional): defaults to `NODE_ENV` or `development`
- `GENFEED_DESKTOP_RELEASE` (optional): explicit release identifier for telemetry and packaged builds

From the repository root:

```bash
bun dev:desktop
```

`bun dev:desktop` builds the Electron main/preload bundle, starts the embedded
`apps/app` Next.js shell, and launches Electron. It does not start the NestJS
API. When no desktop cloud session is present, the app shell runs in
local/offline mode and skips cloud bootstrap requests.

Offline generation still needs an AI provider. Electron stores local provider
settings in its PGlite database and exposes generation actions to `apps/app`
through `window.genfeedDesktop`. The Electron main process calls an
OpenAI-compatible `/chat/completions` endpoint directly. Supported first-class
presets:

- Ollama: `http://localhost:11434/v1`
- LM Studio: `http://localhost:1234/v1`
- any OpenAI-compatible endpoint

The local provider API key stays in desktop local storage and is not returned to
the renderer after save. Generation runs are recorded as durable local
`generation` jobs in the same sync-job table used by the offline queue.

To test cloud or self-hosted API paths, run the backend separately and point the
desktop app at it:

```bash
bun dev:essentials
GENFEED_DESKTOP_API_URL=http://localhost:3010/v1 bun dev:desktop
```

For a hosted setup, use the hosted API URL instead:

```bash
GENFEED_DESKTOP_API_URL=https://api.genfeed.ai/v1 bun dev:desktop
```

## API Runtime Boundary

The desktop app embeds the app shell, not the full NestJS API. The full API
requires its own process and operational dependencies such as the database,
queues, workers, provider keys, and integration callbacks. Desktop should talk
to one of three API modes:

- no API: local/offline desktop mode
- self-hosted API: `GENFEED_DESKTOP_API_URL=http://localhost:3010/v1` or a
  self-hosted domain
- Genfeed Cloud API: `GENFEED_DESKTOP_API_URL=https://api.genfeed.ai/v1`

Do not make a downloaded desktop app require a local clone of the API. If a
local background API is added later, it should be a packaged desktop-local
service with explicit lifecycle management, not an implicit `nest start` from
the repository.

For offline desktop generation, do not add a second REST API and do not fork the
frontend. Keep reusable generation logic in packages, keep cloud/self-hosted
behavior behind the NestJS REST API, and keep desktop-only execution in Electron
main-process services exposed to `apps/app` through IPC. That keeps the
downloaded app useful without requiring Redis, BullMQ, or the server repo.

## Release

```bash
cd apps/desktop/app
bun run smoke
bun run release:mac
```

Optional signing and notarization environment variables:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

## Current Scope

- Electron desktop shell embedding the real `apps/app` frontend
- Typed preload/IPC bridge for auth, workspace, files, drafts, notifications, diagnostics, sync, local generation provider settings, and workflow generation
- PGlite-backed local cache for workspaces, recents, session metadata, provider settings, and sync/generation jobs
- Workspace-backed content run drafts stored in `.genfeed/content-runs.json`
- Offline generation through user-configured OpenAI-compatible local providers
- macOS artifact generation via `electron-builder`, icon generation, and optional notarization hook
