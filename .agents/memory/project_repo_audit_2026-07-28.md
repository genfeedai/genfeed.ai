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
| #519 internal API | **Extracted** → `agent-tool-internal-api.service.ts` (`callInternalApi` + `callInternalFindOne`) |
| #519 onboarding | **Extracted** → `agent-onboarding-tool-handler.service.ts` (6 tools + journey helpers) |
| #519 publish+ | CREATE_POST / SCHEDULE_POST folded into `agent-publish-tool-handler.service.ts` |
| #519 analytics | **Extracted** → `agent-analytics-tool-handler.service.ts` (GET_ANALYTICS) |
| #519 workflows | **Extracted** → `agent-workflow-tool-handler.service.ts` (10 workflow tools + install/bootstrap) |
| #519 media gen | **Extracted** → `agent-media-generation-tool-handler.service.ts` (AI_ACTION + generate_* + identity) |
| #519 proactive+ | DISCOVER_ENGAGEMENTS / DRAFT_ENGAGEMENT_REPLY folded into proactive handler |
| #519 catalog | **Extracted** → `agent-tool-catalog-handler.service.ts` (LIST_GENFEED_TOOLS) |
| #519 brand content | **Extracted** → `agent-brand-content-tool-handler.service.ts` (monthly + voice draft/save) |
| #519 dashboard+ | RENDER_DASHBOARD + hydration folded into dashboard handler |
| #519 prepare | **Extracted** → `agent-prepare-tool-handler.service.ts` (4 prepare tools) |
| #519 quality+ | SELECT_INGREDIENT + SUGGEST_INGREDIENT_ALTERNATIVES folded into quality handler |
| #519 spawn | **Extracted** → `agent-spawn-tool-handler.service.ts` (spawn + request_asset) |
| Executor size | ~9,138 → ~6,499 → ~2,208 → **~515** LOC. Executor is thin routing only (dispatch + scope/action-origin). |

**Out of P0 scope (already epics):** `mongoId` cutover (#1041 + children). Do not drop columns without telemetry (#1779 → #1780 → #1781 → #1782).

**Ship status:** P0 + completed #519 extracts + platform helpers → PR [#2175](https://github.com/genfeedai/genfeed.ai/pull/2175) (`codex/repo-audit-2026-07-28`). Dirty skill symlink deletions stay out of product PRs.

**#519 residual:** none for local tool bodies — executor is routing-only.

## P1 — architecture / DRY (existing GH)

| Track | Issue(s) | Notes |
|---|---|---|
| God services | **#1736** epic; **#519** tool executor (**done on #2175**); **#520** orchestrator next; **#1743** shared platform; **#1738–#1744** family splits | Orchestrator ~5.3k LOC is the remaining god object |
| Workers ↔ API imports | **#1090** | Package boundary |
| Conversation composer + rail registry | **#2012** | Architecture decision first |
| Retire redundant routes | **#1867**, **#2122** | After telemetry |
| Legacy shell compat delete | **#1836** | |
| Server domain extraction | **#1345**, **#1346** | |

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

1. ~~**P1 C slice:** one bounded extract from `agent-tool-executor` under #519 / #1736.~~ **Done** (#2175).
2. **Merge #2175** (human/Codex) when CI green — do not stack more commits on that PR.
3. **#520** — decompose `agent-orchestrator.service.ts` (~5.3k LOC) on a **new branch** off updated `master`.
4. **#2012 decision** on canonical composer + rail registry (no code until decision).
5. **#1090** workers/API boundary when touching workers.

## Handoff — after #2175 (2026-07-29)

**Who merges:** Vincent via Codex (not this Grok session).  
**PR:** [#2175](https://github.com/genfeedai/genfeed.ai/pull/2175) · branch `codex/repo-audit-2026-07-28` · worktree `~/.grok/worktrees/genfeedai-genfeedai/2026-07-28-812b93b8`

### Shipped in #2175
- **P0:** soft-delete `isDeleted` (desktop + contracts); live Prisma scalar FK reads
- **#519 complete:** tool executor ~9.1k → ~518 LOC, **0 local tool bodies**, 86 tools delegated to handlers
- **Platform helpers:** `parsePlatform` / `formatPlatformLabel` / predicates in `@genfeedai/contracts`

### Do NOT continue on the same branch
Open a **new branch from post-merge `master`** for the next god-file work. Keeps review/CI blast radius clean and avoids fighting merge conflicts on a already-large PR.

### Next coding target: #520 (orchestrator)
| File | LOC (approx) | Action |
|---|---|---|
| `apps/server/api/src/services/agent-orchestrator/agent-orchestrator.service.ts` | **~5,329** | Primary #520 target — turn runner + mode/state + context + UI-action splits per issue PRD |
| `tools/agent-workflow-tool-handler.service.ts` | ~1,545 | Optional later split (already extracted from executor) |
| `tools/agent-media-generation-tool-handler.service.ts` | ~1,221 | Optional later split |
| `tools/agent-tool-registry.ts` | ~1,084 | Catalog/metadata — lower urgency |

**Out of scope for immediate “clean big files” unless product-forced:** integration publishers (LinkedIn/IG/TikTok/etc.), stripe, content-optimization — those are #1743 / #1738–#1744 family work under epic #1736, not a free-for-all.

### Suggested Codex prompt (next session)
```
After master includes PR #2175, branch codex/520-decompose-agent-orchestrator off master.
Implement #520: decompose agent-orchestrator.service.ts (~5.3k) per issue PRD —
shared turn runner + bounded mode/state-machine, context, and UI-action services.
Preserve sync + streaming behavior. No new umbrella epic. MacBook: no local
tests/typecheck/build; PR CI is the gate. Ready PR to master.
```

### P0 residual
None for this audit pass. `mongoId` stays on #1041 telemetry path — do not reopen as P0.

## How to use this file

- At session start for “repo quality” work: read this + linked GH issues.
- When closing an item: update the GH issue; leave a one-line status note here only if the map would mislead.
- Do not recreate local TODO markdown for these items.
