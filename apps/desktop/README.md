# Desktop App

`apps/desktop/app` is the standalone Genfeed desktop Content OS shell for the macOS-first installed app release.

## Development

```bash
cd apps/desktop/app
bun install
bun run dev
```

Environment variables:

- `GENFEED_DESKTOP_API_URL` (optional): defaults to `https://api.genfeed.ai/v1`
- `GENFEED_DESKTOP_APP_URL` (optional): defaults to `https://app.genfeed.ai`
- `GENFEED_DESKTOP_AUTH_URL` (optional): defaults to `https://app.genfeed.ai/oauth/cli`
- `GENFEED_DESKTOP_WS_URL` (optional): defaults to `https://notifications.genfeed.ai`
- `GENFEED_DESKTOP_SENTRY_DSN` (optional): enables desktop runtime and renderer telemetry
- `GENFEED_DESKTOP_SENTRY_ENVIRONMENT` (optional): defaults to `NODE_ENV` or `development`
- `GENFEED_DESKTOP_RELEASE` (optional): explicit release identifier for telemetry and packaged builds

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

- Electron desktop shell with native renderer views for conversation, trends, agents, workflows, analytics, and library
- Typed preload/IPC bridge for auth, workspace, files, drafts, notifications, diagnostics, and sync
- SQLite-backed local cache for workspaces, recents, session metadata, and sync jobs
- Workspace-backed content run drafts stored in `.genfeed/content-runs.json`
- macOS artifact generation via `electron-builder`, icon generation, and optional notarization hook
