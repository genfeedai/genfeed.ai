# Local development host migration

`genfeed.localhost` is the canonical interactive-development host. The local
app uses port `3000`, the API uses `3010`, and notifications/websockets use
`3111`. Root environment files are the source of truth; `bun run env:sync local`
distributes those values to app and service env files.

Plain `localhost` remains valid for Docker/self-hosted loopback, health checks,
CI web servers, and tests where cookie/host isolation is irrelevant. Deployed
and containerized notifications continue to use port `3011`.

## Legacy-host audit

The supplied audit baseline reported 129 `local.genfeed.ai` occurrences across
41 files. At this branch point, a fresh tracked-file audit found 133 occurrences
across 42 files: the extra file was a tracked historical session record with
seven occurrences, while three occurrences from the earlier moving-master
snapshot were no longer present.

Every branch-point occurrence was classified as follows:

| Category | Files and occurrence counts | Migration action |
| --- | --- | --- |
| Environment/examples | `.env.example` (27), `apps/app/.env.example` (4), `apps/server/.env.example` (3), `apps/server/api/.env.example` (17), `apps/server/files/.env.example` (1), `apps/server/notifications/.env.example` (1), `apps/website/.env.example` (5) | Replaced active defaults; reconciled the canonical service ports. |
| Active runtime defaults | browser-extension `background.ts` (1) and `environment.service.ts` (3), shared `environment.service.ts` (1), workflow execution config (1) | Moved host selection behind public env or injected config boundaries. |
| Playwright/tooling defaults | Playwright config (2), API mock fixture (1), auth fixture (1), batch spec (1), task specs (2), API interceptor (2), OpenAPI smoke script (1) | Replaced defaults and centralized Playwright API endpoint resolution. |
| Test fixtures | Better Auth config spec (2), localhost guard spec (2), API test env (1), generation-card spec (1), auth-client config spec (4), Redis adapter spec (1), CORS spec (2), shared environment spec (2), logger spec (2) | Replaced ordinary fixtures; retained only assertions that explicitly prove compatibility. |
| Security compatibility | Better Auth config (5), terminal gateway (1), Next development origins (1), Playwright network guard (1) | Retained as temporary allowlist entries, with canonical hosts first. |
| Current documentation | E2E architecture memory (1), `CONTRIBUTING.md` (2), browser-extension docs (18), article HTTP notes (1), MCP URL-normalization notes (1) | Updated current instructions; retained the old host only where the migration/allowlist is being explained. |
| Historical documentation | `.agents/SESSIONS/2026-07-05.md` (7), app navigation audit (4) | Normalized host spellings and added a historical note to the session record. |
| Generated artifacts | None | `dist/` remained excluded and untouched. |

After migration, the old host is permitted only in these explicit compatibility
surfaces:

- Better Auth, CORS, Next `allowedDevOrigins`, local-only HTTP/terminal guards,
  browser-extension host/cookie permissions, and the Playwright network guard.
- Focused tests proving those compatibility entries still work.
- This migration record, durable project memory, and the compatibility note in
  `CONTRIBUTING.md`.

It is not an active default in an environment example, browser/runtime adapter,
Playwright endpoint, current extension guide, or API audit tool.

## Notifications port audit

Port `3111` is used by tracked local env examples, frontend websocket examples,
the notifications service example, local runtime tests, Playwright, and current
development docs.

Remaining `3011` references are intentional:

| Boundary | Files | Reason |
| --- | --- | --- |
| Docker/self-hosted | `docker/Dockerfile*`, `docker/docker-compose*.yml`, `docker/selfhosted-entrypoint.sh`, `packages/config/src/schemas/genfeedai.schema.ts` | Container network and self-hosted compatibility port. |
| Deployed infrastructure | `infra/terraform/**`, `.agents/memory/reference_prod_aws_runtime.md` | Production service/ALB port. |
| Architecture/current docs | `CLAUDE.md`, `CONTRIBUTING.md`, extension README, repo map, project-structure/tech-context memory | Explicitly documents the local/deployed port split. |
| Compatibility test | `packages/libs/config/cors.config.spec.ts` | Proves the loopback/deployed port remains allowed. |
| Shared Claude launch overlap | `.claude/launch.json` | Intentionally left to PR #1716, which already changes its preview port to `3111`; duplicating that edit would create avoidable PR overlap. |

