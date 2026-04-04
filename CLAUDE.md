# CLAUDE.md

TypeScript-first open source AI OS for content creation.

## Workspace

Monorepo with Turborepo + Bun workspaces.

### Apps
- `apps/server/*` — NestJS backend services (api, files, clips, mcp, notifications, workers, discord, slack, telegram, images, videos, voices)
- `apps/web` — Next.js studio UI
- `apps/admin` — Admin panel (model mgmt, GPU config, system settings)
- `apps/website` — Marketing site
- `apps/desktop` — Electron desktop app
- `apps/mobile` — React Native / Expo
- `apps/extensions/*` — Browser + IDE extensions

### Packages
- `packages/*` — Shared packages (`@genfeedai/*` scope)
- `packages/integrations/*` — Platform integrations (twitter, linkedin, etc.)
- `ee/packages/*` — Enterprise features (commercial license)

## Rules

1. No `any` types in TypeScript.
2. No secrets in repo.
3. Prefer existing patterns over novel architecture.
4. Use conventional commits.
5. Keep changes minimal and scoped.
6. Use path aliases (`@genfeedai/*`) over relative imports.

## License

- Root: AGPL-3.0
- `ee/`: Commercial License (see `ee/LICENSE`)
