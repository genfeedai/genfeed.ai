# AGENTS.md — Genfeed.ai Open Source

## Last Verified

- **Date:** 2026-04-07
- **Sources:** local monorepo structure + GitHub issues

## Project Overview

Open-source AI OS for content creation. Self-hosted single-tenant by default, with enterprise multi-tenancy available via `ee/`.

Detailed docs: `.agents/README.md`

## Critical Review Rules

1. Keep serializers in `packages/serializers` — never inline response shaping in controllers.
2. Maintain strict TypeScript quality (no `any`/inline interface shortcuts).
3. Use path aliases, not deep relative imports.
4. Preserve semantic correctness in UI controls (navigation = `Link`, actions = `Button`).
5. Treat MongoDB `users._id` as the canonical user reference. Never use Clerk `user.id` (`clerkId`) as a DB foreign key.
6. Do not manually edit generated `dist/` artifacts.
7. Respect package boundaries: shared logic in `packages/*`, app-specific code in `apps/*`.
8. Enterprise code (`ee/`): enforce multi-tenancy query guards (`{ organization: orgId, isDeleted: false }`).

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

## Pre-Push Baseline

```bash
npx biome check --write .
bunx turbo lint
bun type-check
bun run test --filter=@genfeedai/[changed-package]
```

## Tracking Policy

- Canonical tasks: GitHub issues/projects.
- Local markdown task files are not canonical backlog.
- Exception: `.agents/TASKS/INBOX.md` is allowed for immediate triage only.

## Release Branch Workflow

- Default promotion flow: `develop` → `staging` → `master`.
- Do not open or merge PRs out of order.
- Treat exceptions as temporary and user-directed.

## Documentation

- `.agents/README.md` — Navigation hub for all project docs
- `.agents/context/` — Project context (product, structure, patterns, tech)
- `.agents/rules/` — Coding rules (security, backend, frontend, packages)
- `.agents/agents/` — Specialist agent definitions
- `.agents/SYSTEM/` — Architecture, critical rules, ADRs
- `.agents/features/` — Feature-specific architecture docs
