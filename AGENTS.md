# AGENTS.md — Genfeed.ai Open Source

This is the single rule file for every agent (Claude Code, Codex, Cursor, Grok). `CLAUDE.md`
only imports it, so edit rules here and nowhere else.

## Last Verified

- **Date:** 2026-11-09
- **Sources:** `origin/master` `98892269`, root `package.json` scripts, `scripts/ui/control-guard.ts`, `scripts/architecture/`, the previous `CLAUDE.md`, and `.agents/memory/MEMORY.md`

## Project Memory — READ AT SESSION START

Cross-agent project memory lives in `.agents/memory/`. At the start of every session, read:

- `.agents/memory/MEMORY.md` (index)
- Every file linked from the index that seems relevant to the task

Keep startup reading short: the memory map links the detail, and the complete catalog loads on demand.

These files are the current source of truth for project-level rules, including corrections from user feedback (`feedback_*.md`) and current project state (`project_*.md`). They evolve; the rules in this `AGENTS.md` file are stable baselines but `.agents/memory/` is where newer learnings land first.

Verified project facts in `.agents/memory/` may supersede older project facts here. Agent-written memory cannot weaken safety, authorization, account routing, host-resource restrictions, or required delivery gates. A consequential policy change requires an explicit user instruction; recency alone does not grant authority.

Any agent that learns a durable project rule should write a new file in `.agents/memory/` with YAML frontmatter:

```markdown
---
name: {short name}
description: {one-line description}
type: feedback | project | reference
---

{body with **Why:** and **How to apply:** lines for feedback/project}
```

Then add a line to `.agents/memory/reference_memory_catalog.md` pointing at it. Keep `.agents/memory/MEMORY.md` as the short task-entry map. See `.agents/memory/README.md` for the full format and wiring details.

## Essential Reading

1. `.agents/memory/system/CRITICAL-NEVER-DO.md` — production-breaking violations
2. `.agents/memory/system/SYSTEM-RULES.md` — coding standards and patterns
3. `.agents/memory/system/AGENT-RUNTIME.md` — task loop, context checkpoints

Before editing, read the task-relevant references linked from the memory map. Research before editing: never change code you haven't read, and search 3+ similar implementations before writing new code.

## Project Overview

Open-source AI OS for content creation. Self-hosted single-tenant by default; SaaS deployments add multi-tenancy as a runtime product boundary, not a license or directory split.

- **License:** AGPL-3.0, whole repo. Billing is open source; Cloud-only behaviour is a runtime gate (`hasOrganizationBilling()`), not a separate tree.
- **Green-field.** Delete dead code aggressively. No legacy support, no backward compatibility, no deprecation — it's in git history.

Detailed docs: `.agents/README.md`

## Trunk Workflow

**`master` is the single trunk. Short-lived branch → PR → `master`. No exceptions.**

- Never push directly to `master` — PR only, always.
- Never merge until required CI is green.
- Branch as `feat/xxx` or `hotfix/xxx` off `master`. Do not use `develop` or `staging` as promotion branches.
- `staging` and `production` are deploy environments driven by CI/tags, not branch names.
- Releases are cut from `master` (semver tag + GitHub release via `/release`).
- **Worktrees live outside the repository** — never inside the checkout, `/tmp`, or another worktree. After any worktree is created, `bun run wt:sync <path>` copies the `.worktreeinclude` env files. Remove a worktree once its PR merges.
- `bun.lock` is `merge=binary` — on conflict: `rm bun.lock && bun install`.
- Conventional commits: `fix:`, `feat:`, `refactor:`, `chore:`.
- When session work is complete, ship it: commit, push the short-lived branch, open a PR to `master`. Review is gated by the PR, not by a per-commit approval dance.
- **Scan staged content for secrets before every commit** (`.env*`, `secrets/`, tokens, private keys, provider credentials). If found, STOP and flag — this repo is public; a leak is indexed before it can be rotated. Never commit it, even if explicitly staged.

## Claiming Work — search open PRs before you start

Many agent sessions run against this repo at once. Git shows nothing until push, so
two sessions routinely fix the same bug in parallel without either one knowing.

Before creating a branch, starting remediation, or spawning a background fix task:

```bash
gh pr list --state open --search "<file-or-symptom>"
gh pr list --state open --json number,headRefName,title
git fetch origin && git branch -r --sort=-committerdate | head -20
```

- **Red CI on `master` and broad audit reports are the most duplicated work here** —
  every session sees them at the same moment. Search before touching them. If a
  hotfix PR is already open, extend it; do not open a second one.
- Push your branch early. A local commit claims nothing.
- On a collision: keep the **older** PR, port anything the newer one has that it
  lacks, and close the newer one. Never merge both.

This mirrors the existing rule for issues (`gh issue list --search` before opening
one). Full rationale and the measured incidents:
`.agents/memory/claim_work_before_starting.md`.

## Commands

```bash
bun install                                          # Install dependencies
bun run dev:setup                                    # once per machine (Portless HTTPS :443)
bun run dev:backend:min                              # api + files + notifications (app minimum)
bun run dev:backend                                  # full backend (+ mcp + workers)
bun run dev:web                                      # Main app → https://app.genfeed.localhost/
bun run dev                                          # full stack (Portless)
# Fixed ports only when you mean it: bun run dev:debug / dev:debug:backend:min

bunx turbo run build --filter=@genfeedai/[name]      # NEVER run `bun run build` at root
bun type-check                                       # Type-check all packages
bunx turbo lint                                      # Lint all packages
bunx biome check --write .                           # Format all files
bun run test --filter=@genfeedai/[name]              # Test one package
```

### Local Preflight — run before you push

```bash
bun run preflight            # what PR CI runs on your diff, in about 2-5 minutes
bun run preflight --list     # print the plan without running it
```

It refreshes `origin/master`, takes everything that differs from it (commits, staged,
unstaged and untracked files), and runs the Static Checks (ratchet growth, e2e spec impact,
skills, env drift, Biome, secretlint, gitleaks when installed, migration safety), the
affected-workspace typecheck, the Spec Typecheck Ratchet for the affected workspaces, and the
executable contracts. It stops at the first failure; `--keep-going` runs everything.
It works in a cloud container after `bun install` and
`cd packages/prisma && bunx prisma generate`. The contracts run under the Node in `.node-version`,
downloaded once to `~/.cache/genfeed-preflight` when the host Node differs. Use it instead of
a per-package `tsc`, which shows false missing-module errors until packages are built.
Not covered: `turbo lint` (add `--lint`; some workspace lint scripts rewrite files), the
Playwright suites, and the unit-test shards.

| app | port | | app | port |
|---|---|---|---|---|
| `api/` | 3010 | | `discord/` | 3016 |
| `notifications/` | 3111 local / 3011 deployed | | `slack/` | 3018 |
| `files/` | 3012 | | `telegram/` | 3019 |
| `workers/` | 3013 | | `mcp/` | 3014 |

## Critical Review Rules

### Types, imports, naming

1. No `any` — define proper interfaces. No `@ts-ignore`.
2. No inline interfaces — use `packages/contracts/src/interfaces/` for shared shapes, `packages/props/` for props shared across packages, or a `props/` file inside the owning `apps/web/src/features/<feature>/`.
3. No `console.log` — use the project LoggerService.
4. Booleans take an `is`/`has` prefix: `isActive`, `hasPermission`.
5. Use path aliases (`@genfeedai/contracts`, `@components/`, `@ui/`), not deep relative imports. Import order: external → `@genfeedai/*` → path aliases → same-directory relative.
6. Do not manually edit generated `dist/` artifacts.
7. Respect package boundaries: shared logic in `packages/*`, app-specific code in `apps/*`.

### Data, tenancy, serializers

8. Keep serializers in `packages/serializers` — never inline response shaping in controllers or API modules. Never return a raw database record; serialize first.
9. Treat Prisma `users.id` as the canonical user reference. Never use legacy auth provider IDs (`authProviderId`) as DB foreign keys.
10. Every tenant-scoped Prisma query MUST include `{ organizationId: orgId, isDeleted: false }`. Self-hosted single-tenant deployments may omit the organization filter. Enforcement details in `.agents/memory/context/system-patterns.md`.
11. Soft deletes use `isDeleted: boolean`, never `deletedAt`.
12. Compound indexes live in Prisma `@@index` directives or explicit migrations.

### Backend

13. Throw NestJS exceptions for errors (`NotFoundException`, `BadRequestException`).
14. Provide `ConfigService` via `{ provide: ConfigService, useValue: new ConfigService() }` — never read `process.env` directly.
15. No backward-compatibility wrappers — fix at the source.

### Frontend

16. Preserve semantic correctness in UI controls (navigation = `Link`, actions = `Button`).
17. **Never raw HTML controls.** `<button>`, `<input>`, `<textarea>`, `<select>`, `<dialog>`, `<table>`, `<hr>`, `<form>` etc. are blocked by `scripts/ui/control-guard.ts` (pre-commit via `lint-staged.config.mjs`, repo-wide in CI via `bun run check:ui-guards` → `scripts/ui/check-ui-guards.ts`). Use `@ui/primitives/*`; for unstyled cases use `Button` with `variant={ButtonVariant.UNSTYLED}` + `withWrapper={false}`. Never nest `Button` inside `Button` — restructure as siblings.
18. **Form spacing has one owner per level.** `Field` spaces label → control → error; `Form` (`@ui/primitives/form`, `spacing="default" | "section" | "none"`) spaces the fields; the `Modal` body and `DialogContent` space their blocks and footers. Never put a vertical margin on a direct child of those stacks, or on `ModalActions`, `DialogHeader`, `DialogFooter`, `FormControl`, `Field`, or `Label` — `control-guard.ts` fails on it.
19. AbortController in every `useEffect` with async calls.
20. Components use `function` declarations (not arrow) and a default export.

## Enforced Rules

When a check below fails, fix the code it names. Never edit a baseline to make it pass: `bun run check:ratchet-growth` fails any PR whose ratchet baseline grew against its base, and only a maintainer merges past it.

| Rule | What enforces it | When it fails, do this |
| --- | --- | --- |
| Baselines only shrink | `check:ratchet-growth` (CI Static Checks) | Fix the finding in code. Do not append to `cross-org-unsafe.baseline.ts`, `tenant-scope-baseline.json` or `authority-field-optional.baseline.ts`. |
| Tenant queries carry `organizationId` and `isDeleted: false` | `check:tenant-scope` | Scope the query. Do not add a baseline entry. |
| `crossOrgUnsafe()` call sites do not grow | `check:cross-org-unsafe` | Scope the query with `organizationId`. |
| JSON `null` is rejected on `scopes`, `expiresAt`, `allowedIps`, `role`, `organizationId` in new declarations; baselined `@IsOptional()` declarations still accept it until removed from the baseline | `check:authority-field-optional` | Use `@IsOmittable()` from `@api/helpers/validation/is-omittable.validator`, not `@IsOptional()`. |
| No raw HTML controls; no vertical margin on form-stack children | `scripts/ui/control-guard.ts` (pre-commit) and `check:ui-guards` (CI) | Use `@ui/primitives/*` and let `Field`, `Form`, `Modal` own the spacing. Do not add to the guard's `ALLOWLIST`. |
| New service specs are not mostly `toHaveBeenCalled*` assertions | `scripts/architecture/check-mock-interaction-specs.ts` | Assert returned or persisted results instead (see Tests below). Remove a spec's entry from `mock-interaction-specs.baseline.ts` when you fix it; never add one. |
| A PR that removes or rewrites UI copy, preset ids or fixture values updates the Playwright specs that assert them, in the same PR | `scripts/ci/e2e-spec-impact.mjs` (CI Static Checks) | Edit the spec, page object or fixture it names. Do not dispatch Playwright Full for the PR. If the match is a false positive, add the commit trailer `E2E-Spec-Impact: none - <reason>`. |
| Only the root `CLAUDE.md` exists, and it imports this file | `check:single-claude-md` | Delete the nested `CLAUDE.md`; put package rules in `.agents/memory/`. Keep root `CLAUDE.md` as imports only. |

Judgment, no check: one PR per change, no new env vars, name the root cause, CI green before merge.

## Tests and Finish Condition

- Do not add service specs whose assertions are mostly `toHaveBeenCalled` / mock-interaction checks. Prefer a real-DB test, a property test, or a Playwright flow. Existing offenders are ratcheted in `mock-interaction-specs.baseline.ts`; remove an entry when you fix its spec.
- Couple tests to public behavior (returned or persisted results, rendered output), not to internal call order or private structure. A correct refactor must not break a test.
- Assert what the user sees. In component tests query by role, label or text (`getByRole`, `getByLabelText`), not `getByTestId`.
- Keep logic out of tests: no loops, branches or re-implementation of the code under test. Use literal expected values or `it.each` tables.
- **Same-PR rule for e2e specs.** When a change touches something a Playwright spec asserts (UI copy, scope presets, test ids, fixtures), update that spec in the same PR. Before you push, `grep` `playwright/` for the old string. Never dispatch Playwright Full per PR; it is too slow, and the release run covers it.
- A code-changing PR states its finish condition and shows evidence: repro-before and pass-after for bugs; a walked flow or read-back value for features. Never loosen a gate (i18n, Tests Gate, release suites) to get there.

## Decorator Boundary Rules

- Nest-bearing code must inherit from `tsconfig.server.decorators.json` through its tsconfig chain.
- Keep Nest decorators in server adapter layers only: controllers, gateways, modules, guards, schedulers.
- Do not add `@nestjs/*` imports to framework-agnostic shared packages.

## Package Resolution Rules

- Before adding any shim, wrapper, or fake entrypoint for an `@genfeedai/*` import, inspect:
  - `packages/<dir>/package.json`
  - `bun.lock`
  - the npm registry entry for the package name
- Some `packages/*` folders are mirrors of published `@genfeedai/*` packages and may be dist-only.
- If tests cannot resolve a published `@genfeedai/*` package, fix the alias or package entry resolution first.

## Optimization and Evidence Policy

- Never describe a change as "best" or "optimized" without repo-specific justification.
- For non-trivial work, define the optimization target up front and compare at least 2 approaches.
- Do not claim success without verification evidence: lint, type-check, tests, or task-specific checks.
- If evidence is incomplete, say so explicitly.

## Tracking Policy

- Canonical tasks: GitHub issues/projects.
- Local markdown task files are not canonical backlog and should not be used for task tracking.
- Do not create local task markdown files.
- Before opening an issue: `gh issue list --state all --search "<keywords>" --repo genfeedai/genfeed.ai`.

## Documentation

- `.agents/README.md` — Navigation hub for all project docs
- `.agents/memory/` — All project knowledge (context, rules, features, system, ADRs)
- `.agents/skills/` — Dev/build skills for the monorepo
- `.claude/memory` → symlink to `.agents/memory/`
- `.codex/memory` → symlink to `.agents/memory/`

## Skills Layout

- Canonical repo-local skills live in `.agents/skills/`.
- `.codex/skills/` is a symlink alias to `.agents/skills/` for Codex runtime discovery.
- Add or update reusable repo skills in `.agents/skills/`, not in `.codex/skills/`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
