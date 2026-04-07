# Genfeed.ai — Open Source AI OS for Content Creation

@.agents/context/system-patterns.md
@.agents/context/project-structure.md
@.agents/context/project-style-guide.md

TypeScript monorepo: 4 web/mobile apps, 12 backend services, 45+ shared packages.
Stack: Next.js + NestJS + MongoDB + Redis + BullMQ

## Git Workflow

**Branch flow: `develop` → `staging` → `master`. Always via PR. No exceptions.**

### Rules
- **NEVER push directly to staging or master** — always create a PR
- **NEVER merge to staging until develop CI is green**
- **NEVER merge to master until staging CI is green**
- **Hotfix flow**: `hotfix/xxx` off `master` → fix → PR to `master` → merge back into `develop`
- **Feature work**: `feat/xxx` off `develop` → work → PR to `develop`
- **bun.lock is `merge=binary`** — on conflicts: `rm bun.lock && bun install`

### Pre-Push Checklist (MANDATORY)

```bash
npx biome check --write .
bunx turbo lint
bun type-check
bun run test --filter=@genfeedai/[changed-package]
```

If ANY step fails, fix it before pushing.

## Commands

```bash
# Development
bun install                              # Install dependencies
bun run dev:backend                      # All backend services
bun dev:app @genfeedai/api               # Start API server (port 3001)
bun dev:app @genfeedai/app               # Start main app
bun dev:app @genfeedai/[name]            # Start any specific app

# Build (NEVER run `bun run build` at root)
bun build:app @genfeedai/[name]          # Build specific app

# Quality
bun type-check                           # Type-check all packages
bunx turbo lint                          # Lint all packages
npx biome check --write .                # Format all files

# Testing (single package only — never `bun test` with no filter locally)
bun run test --filter=@genfeedai/[name]  # Run specific package tests
```

## Critical Rules

### Type Safety (ALWAYS)
- No `any` types — define proper interfaces
- No inline interfaces — place in `packages/props/` or `packages/interfaces/`
- No `console.log` — use project LoggerService
- Booleans use `is`/`has` prefix: `isActive`, `hasPermission`

### Import Rules (ALWAYS)
- Path aliases (`@genfeedai/enums`, `@components/`, `@ui/`) over relative imports
- Import order: external packages → internal `@genfeedai/*` → path aliases → same-directory only

### Serializers (ALWAYS)
- Serializers live in `packages/serializers/`, NEVER in API modules
- Never return raw Mongoose documents — serialize first
- Flow: DB Document → Serializer → Client Response

### Frontend (ALWAYS)
- AbortController in every useEffect with async calls
- No `deletedAt` field — use `isDeleted: boolean`
- Components use `function` declarations (not arrow), default export

### Backend (ALWAYS)
- Compound indexes in module `useFactory`, simple indexes via `@Prop` decorator
- NestJS exceptions for errors (`NotFoundException`, `BadRequestException`)
- No backward compatibility wrappers — fix at the source
- Soft deletes: `isDeleted: boolean` (NOT `deletedAt`)
- ConfigService: `{ provide: ConfigService, useValue: new ConfigService() }` — never use `process.env` directly

### Multi-Tenancy (Enterprise `ee/` only)
- Enterprise code under `ee/`: every MongoDB query MUST include `{ organization: orgId, isDeleted: false }`
- Self-hosted single-tenant: organization filter is optional
- **Repo invariant:** All multi-tenant data access code must live under `ee/` or import from `ee/packages/`

### Files & Git (ALWAYS)
- Never commit/push without explicit user approval
- Search 3+ similar implementations before writing new code
- Use conventional commits: `fix:`, `feat:`, `refactor:`, `chore:`

## Architecture

### Backend (`apps/server/`)
| App | Port | Purpose |
|-----|------|---------|
| `api/` | 3001 | Main NestJS API |
| `clips/` | 3002 | Clips processing |
| `discord/` | 3003 | Discord integration |
| `files/` | 3005 | File processing service |
| `mcp/` | 3006 | MCP server for AI tools |
| `notifications/` | 3007 | Notification service |
| `slack/` | 3008 | Slack integration |
| `telegram/` | 3009 | Telegram bot |
| `workers/` | 3010 | Background job processors |
| `images/` | — | Image generation pipeline |
| `videos/` | — | Video generation pipeline |
| `voices/` | — | Voice generation pipeline |

### Frontend
| App | Purpose |
|-----|---------|
| `apps/app/` | Main studio app |
| `apps/admin/` | Admin panel |
| `apps/website/` | Marketing site |
| `apps/desktop/` | Electron desktop app |
| `apps/mobile/` | React Native / Expo |
| `apps/extensions/` | Browser + IDE extensions |

### Infrastructure
- **Self-hosted**: Docker deployment (see `docs/self-hosting.md`)
- **Database**: MongoDB
- **Cache/Queue**: Redis + BullMQ
- **Auth**: Clerk
- **Monitoring**: Sentry
- **CI/CD**: GitHub Actions

## Essential Reading

Before making changes, check:
1. `.agents/SYSTEM/critical/CRITICAL-NEVER-DO.md` — Production-breaking violations
2. `.agents/SYSTEM/critical/RULES.md` — Coding standards and patterns
3. `.agents/SYSTEM/AGENT-RUNTIME.md` — Task loop, context checkpoints

## Green-Field Philosophy

Early-stage open-source project. Delete dead code aggressively. No legacy support. No backward compatibility. Prefer deletion over deprecation. When in doubt, delete — it's in git history.

## License

- Root: AGPL-3.0
- `ee/`: Commercial License (see `ee/LICENSE`)

## Tracking Policy

- GitHub Issues/Projects are canonical for task and status tracking.
- `.agents/TASKS/INBOX.md` is allowed only as immediate triage queue.
