---
name: parallel-qa-local-bugfix-surface-split
description: Two Grok agents share branch qa/local-bugfix — agent surface vs other surfaces; do not steal paths
type: project
status: temporary
last_verified: 2026-08-08
topics: [qa, parallel-agents, shared-checkout, path-scope]
---

# Parallel work split — `qa/local-bugfix` (2026-08-08)

**Branch:** `qa/local-bugfix` (shared checkout — **do not switch branches**)

## Claims

| Agent | Owns | Do not touch |
| --- | --- | --- |
| **Grok A (other session)** | `/agent` surface + `packages/agent/**` agent UI (composer, model selector, thread list, settings in that package) | Non-agent product pages unless handoff says otherwise |
| **Grok B (this session)** | Non-agent product surfaces: Workspace, Messages, Research, Library, Publish, Analytics, Studio, Workflows, Editor, Settings, Admin, onboarding/public chrome, shared shell/nav **outside** agent | `packages/agent/**`, `apps/app/**/agent/**`, agent-only shell/sidebar files |

## Shared-checkout rules (both agents)

1. **Stay on `qa/local-bugfix`.** No checkout/switch/reset/rebase that moves the other agent.
2. **Path-scope every `git add`.** Never `git add -A` / `git add -u`. Stage only your claimed paths.
3. **Recheck `git status` before commit/push.** Shared tree moves; do not sweep the other agent's WIP.
4. **Shared files** (e.g. `packages/ui` switchers, layout chrome, constants): touch only if required for your surface; announce in this file before editing; prefer minimal diffs.
5. **No force-push, no amend of the other's commits.**

## Overlap hotspots to avoid blindly

- `packages/ui/**/model-selector/**` — currently dirty; treat as agent-owned unless Grok B only needs a non-agent consumer fix elsewhere
- `packages/ui/**/switchers/**` / brand switcher — shared chrome; coordinate before edit
- Shell layout under `apps/app/**/AppProtected*` agent sidebar/layout — agent-owned if agent-specific

## Status

- **2026-08-08:** Split agreed by user. Grok B claims non-agent surfaces only. Update this file when a claim is released or a path is handed off.
- **2026-08-08 (Grok B):** Fixing Discover → Following **Follow sources** modal selection (`packages/pages/trends/following/FollowSourceModal.tsx`). Not touching `/agent` or `packages/agent/**`.
- **2026-08-08 (Grok B):** Rebuilt Publish → Review queue (`publish/review/components/*`) — header filters, table list, hover platform preview. Still not touching `/agent`.
- **2026-08-08 (Grok B):** Status filters moved into Publish first-level topbar (`setFiltersNode`) with batch picker; nested review header removed.
