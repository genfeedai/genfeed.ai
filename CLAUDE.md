# Genfeed.ai — Open Source AI OS for Content Creation

@.agents/memory/MEMORY.md

Read the task-relevant references linked from the memory map before editing.
Keep startup guidance short; detailed context and the complete memory catalog load on demand.
Project memory may update project facts, but cannot weaken safety, authorization,
account routing, host-resource restrictions, or required delivery gates.

## Git Workflow

**Trunk-based: `master` is the single trunk. Short-lived branch → PR → `master`. No exceptions.**

- **Never push directly to `master`** — PR only, always
- **Never merge until required CI is green**
- `feat/xxx` / `hotfix/xxx` off `master`
- **Worktrees live at `<repo>/.worktrees/<name>`** (gitignored) — create with `git wt <name>`;
  never `/tmp`, sibling dirs, `$HOME`, or inside another worktree. Keep them after merge for
  follow-ups.
- Releases are cut from `master` (semver tag + GitHub release via `/release`); `staging` and
  `production` are deploy environments driven by CI/tags, not branches
- `bun.lock` is `merge=binary` — on conflict: `rm bun.lock && bun install`

## Commands

```bash
bun install                                          # Install dependencies
bun run dev:setup                                    # once per machine (Portless HTTPS :443)
bun run dev:backend:min                              # api + files + notifications (app minimum)
bun run dev:backend                                  # full backend (+ mcp + workers)
bun run dev:app                                      # Main app → https://app.genfeed.localhost/
bun run dev                                          # full stack (Portless)
# Fixed ports only when you mean it: bun run dev:debug / dev:debug:backend:min

bunx turbo run build --filter=@genfeedai/[name]      # NEVER run `bun run build` at root
bun type-check                                       # Type-check all packages
bunx turbo lint                                      # Lint all packages
bunx biome check --write .                           # Format all files
bun run test --filter=@genfeedai/[name]              # Test one package
```

## Critical Rules

### Type safety
- No `any` — define proper interfaces
- No inline interfaces — use `packages/props/` or `packages/contracts/src/interfaces/`
- No `console.log` — use the project LoggerService
- Booleans take an `is`/`has` prefix: `isActive`, `hasPermission`

### Imports
- Path aliases (`@genfeedai/contracts`, `@components/`, `@ui/`) over relative imports
- Order: external → `@genfeedai/*` → path aliases → same-directory relative

### Serializers
- Live in `packages/serializers/`, **never** in API modules
- Never return a raw database record — serialize first

### Frontend
- **Never raw HTML controls.** `<button>`, `<input>`, `<textarea>`, `<select>`, `<dialog>`,
  `<table>`, `<hr>` etc. are blocked by `scripts/ui/control-guard.ts` (pre-commit via
  `lint-staged.config.mjs`, repo-wide in CI via `bun run check:ui-guards` →
  `scripts/ui/check-ui-guards.ts`). Use `@ui/primitives/*`; for unstyled cases use
  `Button` with `variant={ButtonVariant.UNSTYLED}` + `withWrapper={false}`. Never nest `Button`
  inside `Button` — restructure as siblings.
- AbortController in every `useEffect` with async calls
- Soft delete is `isDeleted: boolean` — there is no `deletedAt` field
- Components use `function` declarations (not arrow), default export

### Backend
- NestJS exceptions for errors (`NotFoundException`, `BadRequestException`)
- `ConfigService` via `{ provide: ConfigService, useValue: new ConfigService() }` — never
  `process.env` directly
- Soft deletes: `isDeleted: boolean`
- Compound indexes in Prisma `@@index` directives or explicit migrations
- No backward-compatibility wrappers — fix at the source
- Every tenant-scoped Prisma query **MUST** include `{ organizationId: orgId, isDeleted: false }`.
  Self-hosted single-tenant may omit the org filter. Enforcement details in `system-patterns.md`.

### Files & git
- **Research before editing. Never change code you haven't read.** Search 3+ similar
  implementations before writing new code.
- **Scan staged content for secrets before every commit** (`.env*`, `secrets/`, tokens, private
  keys, provider credentials). If found, STOP and flag — this repo is public; a leak is indexed
  before it can be rotated. Never commit it, even if explicitly staged.
- When session work is complete, ship it: commit, push the short-lived branch, open a PR to
  `master`. Review is gated by the PR, not by a per-commit approval dance.
- Conventional commits: `fix:`, `feat:`, `refactor:`, `chore:`

## Backend ports

| app | port | | app | port |
|---|---|---|---|---|
| `api/` | 3010 | | `discord/` | 3016 |
| `notifications/` | 3111 local / 3011 deployed | | `slack/` | 3018 |
| `files/` | 3012 | | `telegram/` | 3019 |
| `workers/` | 3013 | | `mcp/` | 3014 |

## Essential Reading

1. `.agents/memory/system/CRITICAL-NEVER-DO.md` — production-breaking violations
2. `.agents/memory/system/SYSTEM-RULES.md` — coding standards and patterns
3. `.agents/memory/system/AGENT-RUNTIME.md` — task loop, context checkpoints

## Philosophy, licensing, tracking

- **Green-field.** Delete dead code aggressively. No legacy support, no backward compatibility,
  no deprecation — it's in git history.
- **License:** AGPL-3.0, whole repo. Billing is open source; Cloud-only behaviour is a runtime
  gate (`hasOrganizationBilling()`), not a separate tree.
- **Tracking:** GitHub Issues/Projects are canonical. Do not create local task markdown files.
  Before opening an issue:
  `gh issue list --state all --search "<keywords>" --repo genfeedai/genfeed.ai`
