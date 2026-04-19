# AGENTS.md — Genfeed.ai Open Source

## Last Verified

- **Date:** 2026-04-07
- **Sources:** local monorepo structure + GitHub issues

## Project Memory — READ AT SESSION START

Cross-agent project memory lives in `.agents/memory/`. At the start of every session, read:

- `.agents/memory/MEMORY.md` (index)
- Every file linked from the index that seems relevant to the task

These files are the current source of truth for project-level rules, including corrections from user feedback (`feedback_*.md`) and current project state (`project_*.md`). They evolve; the rules in this `AGENTS.md` file are stable baselines but `.agents/memory/` is where newer learnings land first.

**If a rule in `.agents/memory/` conflicts with a rule in this `AGENTS.md`, the `.agents/memory/` version wins** (it's newer).

Any agent that learns a durable project rule should write a new file in `.agents/memory/` with YAML frontmatter:

```markdown
---
name: {short name}
description: {one-line description}
type: feedback | project | reference
---

{body with **Why:** and **How to apply:** lines for feedback/project}
```

Then add a line to `.agents/memory/MEMORY.md` pointing at it. See `.agents/memory/README.md` for the full format and wiring details.

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
- Local markdown task files are not canonical backlog and should not be used for task tracking.
- Do not create or maintain `.agents/TASKS/INBOX.md`.

## Release Branch Workflow

- Default promotion flow: `develop` → `staging` → `master`.
- Do not open or merge PRs out of order.
- Treat exceptions as temporary and user-directed.

## Documentation

- `.agents/README.md` — Navigation hub for all project docs
- `.agents/context/` — Project context (product, structure, patterns, tech)
- `.agents/rules/` — Coding rules (security, backend, frontend, packages)
- `.agents/skills/` — Canonical repo-local skill bundles shared across agents
- `.agents/agents/` — Specialist agent definitions
- `.agents/SYSTEM/` — Architecture, critical rules, ADRs
- `.agents/features/` — Feature-specific architecture docs

## Skills Layout

- Canonical repo-local skills live in `.agents/skills/`.
- `.codex/skills/` is a symlink alias to `.agents/skills/` for Codex runtime discovery.
- Add or update reusable repo skills in `.agents/skills/`, not in `.codex/skills/`.

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
