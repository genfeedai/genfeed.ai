# AGENTS.md — Genfeed.ai Open Source

This is the single rule file for every agent (Claude Code, Codex, Cursor, Grok). `CLAUDE.md`
only imports it, so edit rules here and nowhere else.

## Last Verified

- **Date:** 2026-11-21

## Project Memory — READ AT SESSION START

Cross-agent project memory lives in `.agents/memory/`. At the start of every session, read `.agents/memory/MEMORY.md` (the index) and every file it links that seems relevant to the task. The complete catalog loads on demand.

These files are the current source of truth for project-level rules, including corrections from user feedback (`feedback_*.md`) and current project state (`project_*.md`). This `AGENTS.md` holds the stable baselines; `.agents/memory/` is where newer learnings land first.

Verified project facts in `.agents/memory/` may supersede older project facts here. Agent-written memory cannot weaken safety, authorization, account routing, host-resource restrictions, or required delivery gates. A consequential policy change requires an explicit user instruction; recency alone does not grant authority.

Any agent that learns a durable project rule writes a new file in `.agents/memory/` and adds a line to `.agents/memory/reference_memory_catalog.md`. Format and wiring: `.agents/memory/README.md`.

## Before Editing

Read the task-relevant references linked from the memory map. `.agents/memory/system/CRITICAL-NEVER-DO.md` holds the file-management rules. Research before editing: never change code you haven't read, and search 3+ similar implementations before writing new code.

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
- **Work is not done until it is a pull request.** A branch is not a deliverable: commits on a pushed branch with no PR are invisible, and the redesign that sat on one never shipped. Open the PR (as a draft, per Pull Requests below) before you report the work done, and put its URL in the report. Never write "done", "ready" or "pushed to a branch" without a PR number. If you stop before it is finished, open the draft PR anyway and say what is left. Before you end a session, run `git branch -r --no-merged origin/master` and open a PR for every branch of yours that appears.
- **Delete the branch once its PR merges.** Repository setting "Automatically delete head branches" is on; delete any branch of yours that is still left. The weekly `Stale Branches` workflow (`scripts/ci/stale-branches.mjs`) lists what is left (no PR, merged, stalled) in one rolling issue; it only reports, it never deletes. `codex/*` and `grok/*` belong to other agents: never touch them.
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

Rationale and the measured incidents: `.agents/memory/claim_work_before_starting.md`.

## Commands

```bash
bun install                                          # Install dependencies
bun run dev:setup                                    # once per machine (Portless HTTPS :443)
bun run dev:backend:min                              # api + files + notifications + workers (app minimum; workers run agent turns)
bun run dev:backend                                  # full backend (+ mcp)
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
affected-workspace typecheck, the Spec Typecheck for the affected workspaces, and the
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

Judgement rules (naming, component shape, UI composition, form spacing, test style) live in `.agents/memory/rules/coding-standards.md`; read it before changing TypeScript or TSX. Rules a tool can check are in Enforced Rules below.

### Types, imports

- No `any` — define proper interfaces. No `@ts-ignore`.
- No inline interfaces — use `packages/contracts/src/interfaces/` for shared shapes, `packages/props/` for props shared across packages, or a `props/` file inside the owning `apps/web/src/features/<feature>/`.
- No `console.log` — use the project LoggerService.
- Use path aliases (`@genfeedai/contracts`, `@components/`, `@ui/`), not deep relative imports. Import order: external → `@genfeedai/*` → path aliases → same-directory relative.
- Do not manually edit generated `dist/` artifacts.
- Respect package boundaries: shared logic in `packages/*`, app-specific code in `apps/*`.

### Data, tenancy, serializers

- Keep serializers in `packages/serializers` — never inline response shaping in controllers or API modules. Never return a raw database record; serialize first.
- Treat Prisma `users.id` as the canonical user reference. Never use legacy auth provider IDs (`authProviderId`) as DB foreign keys.
- Every tenant-scoped Prisma query MUST include `{ organizationId: orgId, isDeleted: false }`. Self-hosted single-tenant deployments may omit the organization filter. Enforcement details in `.agents/memory/context/system-patterns.md`.
- Soft deletes use `isDeleted: boolean`, never `deletedAt`.
- Compound indexes live in Prisma `@@index` directives or explicit migrations.

### Backend

- Throw NestJS exceptions for errors (`NotFoundException`, `BadRequestException`).
- Provide `ConfigService` via `{ provide: ConfigService, useValue: new ConfigService() }` — never read `process.env` directly.
- No backward-compatibility wrappers — fix at the source.

## Enforced Rules

When a check below fails, fix the code it names. Never edit a baseline to make it pass: `bun run check:ratchet-growth` fails any PR whose ratchet baseline grew against its base, and only a maintainer merges past it.

| Rule | What enforces it | When it fails, do this |
| --- | --- | --- |
| Baselines only shrink | `check:ratchet-growth` (CI Static Checks) | Fix the finding in code. Do not append to `cross-org-unsafe.baseline.ts`, `tenant-scope-baseline.json` or `authority-field-optional.baseline.ts`. |
| Tenant queries carry `organizationId` and `isDeleted: false` | `check:tenant-scope` | Scope the query. Do not add a baseline entry. |
| `crossOrgUnsafe()` call sites do not grow | `check:cross-org-unsafe` | Scope the query with `organizationId`. |
| JSON `null` is rejected on `scopes`, `expiresAt`, `allowedIps`, `role`, `organizationId` in new declarations; baselined `@IsOptional()` declarations still accept it until removed from the baseline | `check:authority-field-optional` | Use `@IsOmittable()` from `@api/helpers/validation/is-omittable.validator`, not `@IsOptional()`. |
| `useEffect` calls and async effects without an abort do not grow per file | `check:use-effect` (executable contracts) and `check:ratchet-growth` | Remove the effect (derive in render, move to the handler, use a data hook) or add the AbortController. Never add to `use-effect.baseline.json`. An effect that only subscribes to a system outside React takes `// use-effect-audit: ignore <reason>` on the line above. |
| No raw HTML controls; no vertical margin on form-stack children | `scripts/ui/control-guard.ts` (pre-commit) and `check:ui-guards` (CI) | Use `@ui/primitives/*` and let `Field`, `Form`, `Modal` own the spacing. Do not add to the guard's `ALLOWLIST`. |
| New service specs are not mostly `toHaveBeenCalled*` assertions | `scripts/architecture/check-mock-interaction-specs.ts` | Assert returned or persisted results instead (see Tests below). Remove a spec's entry from `mock-interaction-specs.baseline.ts` when you fix it; never add one. |
| A PR that removes or rewrites UI copy, preset ids or fixture values updates the Playwright specs that assert them, in the same PR | `scripts/ci/e2e-spec-impact.mjs` (CI Static Checks) | Edit the spec, page object or fixture it names. Do not dispatch Playwright Full for the PR. If the match is a false positive, add the commit trailer `E2E-Spec-Impact: none - <reason>`. |
| No `console.log` in production source | Biome `suspicious/noConsole` (`warn`, `error`, `info`, `debug` stay allowed; tests, `scripts/`, `packages/cli`, config files and logger implementations are exempt) | Use `LoggerService`. |
| No `process.env` in `apps/server/api/src` | Biome `style/noProcessEnv` (specs and fixtures are exempt) | Read the value through `ConfigService`. Code that runs before DI exists (Sentry init, `main.ts`, decorators, import-time constants) takes `// biome-ignore lint/style/noProcessEnv: <reason>`. |
| No import climbs 3 or more folders (`../../../`) | Biome `style/noRestrictedImports` (tests, `scripts/`, `packages/actions/src` and `packages/workflows/src` are exempt) | Import through a path alias (`@api/`, `@app/`, `@ui/`, `@genfeedai/*`). If none reaches the file, add the alias to the app's `tsconfig.json` and `apps/vitest.config.mts`. |
| A hand-built Nest test module provides everything its classes inject | `check:test-module-providers` (executable contracts) | Add the named collaborator to the module's `providers`, or provide a stand-in `{ provide: X, useValue }` after it. The API E2E suites run only nightly, so without this guard the gap merges green and reddens master. |
| `window.open` runs after an `await` or in a `.then` callback, outside the click, so the browser blocks the tab | `check:window-open-after-await` (executable contracts) | In `apps/web`, open the tab first with `openInNewTab` from `@/lib/navigation/open-in-new-tab`. Elsewhere (the extension has no `@/` alias), open the blank tab before the request and set its location afterwards, or use `chrome.tabs.create`. Passing `'_self'` is accepted but replaces the current page. Never raise a count in `WINDOW_OPEN_ALLOWANCES`. |
| A processor publishes `'failed'` from a `catch` on every attempt, so a job that succeeds on retry stays failed | `check:final-attempt-failure` (executable contracts) | Publish only on the last attempt: `if (isFinalAttempt(job))`, or report through a helper that starts with `if (!isFinalAttempt(job)) return`. |
| An outbound HTTP call has no timeout, so a provider that stops answering holds the request, and the connection, lock or queue slot behind it, open for ever | `check:http-timeout` (executable contracts) | Register `HttpModule` as `HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS })` (`@api/constants/http-timeout.constant`), give a transfer that can outlast it a longer `timeout` on the call, and pass `fetch` `signal: AbortSignal.timeout(ms)`. Never raise a count in `HTTP_TIMEOUT_ALLOWANCES`. |
| Only the root `CLAUDE.md` exists, and it imports this file | `check:single-claude-md` | Delete the nested `CLAUDE.md`; put package rules in `.agents/memory/`. Keep root `CLAUDE.md` as imports only. |

Judgment, no check: one PR per change, no new env vars, name the root cause, CI green before merge.

## Tests and Finish Condition

- Do not add service specs whose assertions are mostly `toHaveBeenCalled` / mock-interaction checks. Prefer a real-DB test, a property test, or a Playwright flow. Existing offenders are ratcheted in `mock-interaction-specs.baseline.ts`; remove an entry when you fix its spec.
- **No sleeps in tests.** Never `setTimeout`, `waitForTimeout`, `timers/promises` or a hand-rolled `sleep` in a spec, fixture, page object or Playwright file: a fixed sleep is slower than the event it waits for and flaky when the machine is busy. Unit tests use fake timers (`vi.useFakeTimers()`, then `vi.advanceTimersByTimeAsync`) for time-driven code, `vi.waitFor` for async results, and `await new Promise((resolve) => setImmediate(resolve))` to drain a promise chain. Playwright waits on the real signal (`expect(locator)`, `expect.poll`, `page.waitForResponse`, `page.waitForURL`) or uses `page.clock` for time-driven UI. `test.setTimeout(...)` only sets the test budget and stays allowed. Production `setTimeout` is out of scope. Test style (public behavior, role queries, no logic in tests): `.agents/memory/rules/coding-standards.md`.
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

## Gardener Rule

Tend the monorepo, and every other Genfeed repository, like a garden: tell the good plants from the weeds.

- Before adding a feature, package or other new brick, check it has clear boundaries, so it can be updated, upgraded, refactored or taken out of the monorepo cleanly later.
- Prefer isolated packages with an explicit public API over cross-imports into another package's internals.
- Remove weeds as you find them: delete dead code instead of letting it pile up.
- Keep the i18n gate strict: a cleanup PR deletes the strings and baseline entries for the code it removes.

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

## Pull Requests — draft until ready

**Open every PR as a draft, iterate while it is a draft, mark it ready once.** CI does not run
on a draft: Plan, Static Checks and the test jobs are skipped, and `Validation Verdict` fails
until the PR is ready, so a draft cannot merge by accident. A push to a draft costs no runner
time. A push to a ready PR starts a full run and cancels the one before it, and those cancelled
runs were 35% of PR runner time (issue #8614).

- Create the PR with `gh pr create --draft` (or `draft: true` in the GitHub tool).
- While it is a draft, push as often as you like. Run `bun run preflight` before you mark it
  ready; it runs the checks that fail most often in CI (executable contracts, spec typecheck
  ratchet, Biome, affected typecheck) for the files you changed.
- Merge `master` into the branch before marking ready, so the one run tests the head that will
  merge. Resolve conflicts and re-run preflight first if the merge touched your files.
- Mark it ready (`gh pr ready`, or `draft: false`) only when the branch is finished. That
  starts the single run.
- After it is ready, push only to fix a red check or a review comment. Batch review fixes into
  one push. Do not push partial work, formatting or follow-up tests to a ready PR; each push
  cancels the run in progress.
- If a ready PR needs more than a fix (new scope, a rework), convert it back to draft, push
  there, and mark it ready once more. A run already in progress keeps running until it ends
  or a newer ready push replaces it.
- Squash-merge a green ready PR right away.

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

## ui-sdk

`@ui-sdk/react` and `@ui-sdk/core` are installed in `apps/web`. They are headless: behaviour, focus and ARIA, with no styles of their own.

- Before using ui-sdk, follow the `ui-sdk` skill (`.agents/skills/ui-sdk/`) if it is installed, and read `apps/web/node_modules/@ui-sdk/react/docs/llms.txt`. To build a new component, also search `apps/web/node_modules/@ui-sdk/react/docs/core.md` by heading, and read `rendering.md` next to it.
- Do not import `@ui-sdk/core/web.css`. It restyles bare `a`, `hr`, `code` and `kbd`, sets its own focus outline, and takes its colours from the OS colour scheme instead of `data-theme`. Style ui-sdk parts with the tokens in `DESIGN.md`.
- The skill is vendored and pinned in `skills-lock.json`; do not edit it. Where it and this file disagree, this file wins.
