# Genfeed.ai — Open Source AI OS for Content Creation

@.agents/memory/MEMORY.md
@.agents/context/system-patterns.md
@.agents/context/project-structure.md
@.agents/context/project-style-guide.md

TypeScript monorepo: 6 app surfaces, 12 backend services, 45+ shared packages.
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
bun dev:app @genfeedai/api               # Start API server (port 3010)
bun dev:app @genfeedai/app               # Start main app
bun dev:app @genfeedai/[name]            # Start any specific app

# Build (NEVER run `bun run build` at root)
bun build:app @genfeedai/[name]          # Build specific app

# Quality
bun type-check                           # Type-check all packages
bunx turbo lint                          # Lint all packages
npx biome check --write .                # Format all files

# Testing
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
- **Never raw HTML elements** — use `@ui/primitives/*` instead. `<button>`, `<input>`, `<textarea>`, `<select>`, `<dialog>`, `<table>`, `<hr>`, etc. are blocked by `scripts/lint-no-raw-html.sh` pre-commit hook. For unstyled usage, use `Button` with `variant={ButtonVariant.UNSTYLED}` + `withWrapper={false}`. Never nest `Button` inside `Button` (invalid HTML) — restructure as siblings.

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
- **Research the codebase before editing. Never change code you haven't read.**
- Never commit/push without explicit user approval
- Search 3+ similar implementations before writing new code
- Use conventional commits: `fix:`, `feat:`, `refactor:`, `chore:`

## Architecture

### Backend (`apps/server/`)
| App | Port | Purpose |
|-----|------|---------|
| `api/` | 3010 | Main NestJS API |
| `notifications/` | 3011 | Notification service |
| `files/` | 3012 | File processing service |
| `workers/` | 3013 | Background job processors |
| `mcp/` | 3014 | MCP server for AI tools |
| `clips/` | 3015 | Clips processing |
| `discord/` | 3016 | Discord integration |
| `slack/` | 3018 | Slack integration |
| `telegram/` | 3019 | Telegram bot |
| `images/` | 3020 | Image generation pipeline |
| `videos/` | 3021 | Video generation pipeline |
| `voices/` | 3022 | Voice generation pipeline |

### Frontend
| App | Purpose |
|-----|---------|
| `apps/app/` | Main studio app |
| `apps/docs/` | Documentation site |
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
- Do not create or maintain local task queues such as `.agents/TASKS/INBOX.md`.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
