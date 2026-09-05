# AGENTS.md — Genfeed.ai Open Source

## Last Verified

- **Date:** 2026-07-11
- **Sources:** fetched `origin/master`, local monorepo structure, package manifests, and trunk rules

## Project Memory — READ AT SESSION START

Cross-agent project memory lives in `.agents/memory/`. At the start of every session, read:

- `.agents/memory/MEMORY.md` (index)
- Every file linked from the index that seems relevant to the task

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

## Project Overview

Open-source AI OS for content creation. Self-hosted single-tenant by default; SaaS deployments add multi-tenancy as a runtime product boundary, not a license or directory split.

Detailed docs: `.agents/README.md`

## Critical Review Rules

1. Keep serializers in `packages/serializers` — never inline response shaping in controllers.
2. Maintain strict TypeScript quality (no `any`/inline interface shortcuts).
3. Use path aliases, not deep relative imports.
4. Preserve semantic correctness in UI controls (navigation = `Link`, actions = `Button`).
5. Treat Prisma `users.id` as the canonical user reference. Never use legacy auth provider IDs (`authProviderId`) as DB foreign keys.
6. Do not manually edit generated `dist/` artifacts.
7. Respect package boundaries: shared logic in `packages/*`, app-specific code in `apps/*`.
8. Every tenant-scoped Prisma query MUST include `{ organizationId: orgId, isDeleted: false }`.
9. Self-hosted single-tenant deployments may omit the organization filter.
10. Soft deletes use `isDeleted: boolean`, never `deletedAt`.

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

## Trunk Workflow

- `master` is the single trunk.
- Create short-lived branches from `master`, then open PRs back to `master`.
- Do not use `develop` or `staging` as promotion branches.
- `staging` and `production` are deploy environments, not branch names.

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
