---
name: repo audit 2026-07-28
description: Full-repo audit findings, GH mapping, remaining P1–P3 tracks
type: project
---

# Repo audit — 2026-07-28

Audit-only pass, then P0 implementation. Remaining work is tracked here so it is not lost. **GitHub Issues are canonical backlog** — this file is a map, not a second backlog.

## GH epic question

**Do not open a new umbrella epic.** Almost every P1/P2 item already has an open issue or epic. Prefer:

1. Link work to the existing issue.
2. Only open a **child issue** when a gap is real and not covered (search first: `gh issue list --state all --search "..."`).
3. Use Project #12 for priority/status, not a mega-audit epic.

## P0 — done in this pass (2026-07-28)

| Item | Action |
|---|---|
| Soft-delete `deletedAt` on desktop | Migrated desktop asset schema + contracts + sync/API wire to `isDeleted` + `updatedAt` tombstone |
| Live Prisma alias reads | Scalar-first fixes in bot resolver, credentials controller, asset-access guard, TikTok status, YouTube analytics enqueue, content-engine, BYOK billing, ad-optimization, reply-bot |
| Soft-delete memory | `project_soft_delete_is_deleted.md` |

## P1 progress (same worktree)

| Item | Status |
|---|---|
| #519 brand interview | **Extracted** → `agent-brand-interview-tool-handler.service.ts` (4 tools) |
| #519 campaign | **Extracted** → `agent-campaign-tool-handler.service.ts` (5 tools) |
| #519 workspace | **Extracted** → `agent-workspace-tool-handler.service.ts` (credits + brands) |
| #519 connection | **Extracted** → `agent-connection-tool-handler.service.ts` (status + OAuth card) |
| #519 trends | **Extracted** → `agent-trends-tool-handler.service.ts` |
| #519 proactive | **Extracted** → `agent-proactive-tool-handler.service.ts` (approval/perf/calendar/strategy; discover/draft stay for callInternalApi) |
| #519 quality | **Extracted** → `agent-quality-tool-handler.service.ts` (rate content/SEO/ingredient + top/replicate) |
| #519 review queue | **Extracted** → `agent-review-tool-handler.service.ts` |
| #519 workspace+ | list_posts + open_studio_handoff folded into workspace handler |
| #519 connection+ | resolve_handle folded into connection handler |
| #519 ads research | **Extracted** → `agent-ads-research-tool-handler.service.ts` (5 tools + brand/workflow helpers) |
| #519 livestream | **Extracted** → `agent-livestream-tool-handler.service.ts` (create + manage) |
| Executor size | ~9,138 → **~6,499** LOC. Remaining heavy: onboarding, workflows, media generation, publish, analytics. |

**Out of P0 scope (already epics):** `mongoId` cutover (#1041 + children). Do not drop columns without telemetry (#1779 → #1780 → #1781 → #1782).

**Ship status:** P0 + completed #519 extracts + platform helpers → PR [#2175](https://github.com/genfeedai/genfeed.ai/pull/2175) (`codex/repo-audit-2026-07-28`, rebased onto `master` after `#2172`). Dirty skill symlink deletions stay out of product PRs.

**Next extract (this worktree):** onboarding (`callInternalApi`) → workflows / media gen / publish / analytics.

## P1 — architecture / DRY (existing GH)

| Track | Issue(s) | Notes |
|---|---|---|
| God services | **#1736** epic; **#519** tool executor; **#520** orchestrator; **#1743** shared platform; **#1738–#1744** family splits | `agent-tool-executor.service.ts` ~9k LOC |
| Workers ↔ API imports | **#1090** | Package boundary |
| Conversation composer + rail registry | **#2012** | Architecture decision first |
| Retire redundant routes | **#1867**, **#2122** | After telemetry |
| Legacy shell compat delete | **#1836** | |
| Server domain extraction | **#1345**, **#1346** | |
| Workflow node-actions DRY | local TODO in `.agents/TODOS/workflow-selection-optimization.md` | Prefer promote to GH child under workflow quality if still open |

## P2 — quality / tooling (existing GH)

| Track | Issue(s) |
|---|---|
| Fallow complexity | **#2133**, **#2081**, **#1635** |
| React Doctor cleanup | **#338** |
| Backend lint → zero | **#1095** |
| E2E route coverage / release flake | **#2162–#2165**, **#2079** |
| Coverage / CI integrity | **#1846**, **#1829**, **#1849** |
| Adaptive PR validation latency | **#1850**, **#1969** |
| Stack audit remediation umbrella | **#1176** (if still the right parent for tool debt) |

## P3 — optimize (measured only)

1. CI latency budgets (#1850 / #1969) — highest ROI “optimize”.
2. Split agent tool executor (#519) — compile/test/load cost.
3. Finish workflow selection/clipboard DRY (after #workflow helpers already shipped).
4. `cron-jobs` product path is workflow-backed; keep thin compat only until traffic is zero.

Avoid: random memoization sweeps, package merges without a surface.

## Known non-code debt from progress.md

- Full monorepo type-check historically blocked on `@genfeedai/ui` / client schemas — re-verify on Studio before treating as current.
- MCP/notifications Vitest blocked on `unplugin-swc` resolution — tooling fix, not product.
- Skeleton unit tests (`// TODO: Add interaction tests`) — delete or implement; ~16 stubs.

## Recommended next sequence after P0

1. **P1 C slice:** one bounded extract from `agent-tool-executor` under #519 / #1736.
2. **#2012 decision** on canonical composer + rail registry (no code until decision).
3. **#1090** workers/API boundary when touching workers.

## How to use this file

- At session start for “repo quality” work: read this + linked GH issues.
- When closing an item: update the GH issue; leave a one-line status note here only if the map would mislead.
- Do not recreate local TODO markdown for these items.
