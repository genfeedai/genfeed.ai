---
name: qa-session-leftovers-2026-07-30
description: Leftovers from continuous product QA session after PR #2204 — boil the ocean next
type: project
---

# QA session leftovers (after #2204)

**Why:** Session was too long to finish everything. Merge #2204 to flat `master`, then continue these in the next QA train. Do not drop them.

**How to apply:** After #2204 lands, open a fresh branch from `master` and work this list as one continuous QA stream (keep QA together).

## Must verify (product)

Worked as one train on 2026-07-31 (`qa/train-2026-07-31`). All seven audited
against code; fixes landed for the three that were broken.

- [x] Social: Add/Edit link modal + POST `/v1/links` after `brand` → `brandId` map — correct. The remap lives only in `LinksService.normalizeData()` and is covered by `links.service.spec.ts`
- [x] Public Profile toggle sticks (scope case + Switch label) — write path uppercases via `BaseService.normalizeEnumScalarValue`, read path lowercases in the `Brand` model; `Switch` renders its label as a sibling `span`, regression-tested. Hardened the one bare comparison behind `isPublicAssetScope`
- [x] Interview draft store survives reload — `brand-interview-draft.store.ts` persists `byBrandId` under `genfeed-brand-interview-drafts-v1`, no `skipHydration`
- [x] Studio Video empty: no Frame Sequence block — `GenerateEmptyState` renders heading + composer only
- [x] Studio Storyboard: Frame sequence / Scenes / Merge modes work end-to-end — **fixed.** Scenes mode enabled "Merge clips" at 2 completed scenes while the guard demanded every frame be completed
- [x] Brand switcher: active row selected wash — `bg-foreground/[0.08]` + check + `aria-current` via the shared `SwitcherDropdown`
- [x] Library nav + status filters + AppSwitcher underlines — nav/filter wiring correct; **fixed** duplicate voices status options. AppSwitcher underlines are **done, nothing to do**: removed on purpose in #2204, active state is the filled icon tile

Audited against code, not clicked through — protected routes need a sign-in the
agent has no non-interactive path to. Each fix carries a regression test.

## Still open from this train

- `LinksController.buildFindAllQuery` filters on raw `where.brand`; `normalizeWhere` only remaps writes, so the standalone `GET /links?brand=` path is unmapped. Not on the modal's path (the Social page reads links through `brand.links`)
- `link.config.ts` uses `simpleConfig`, so `brand` is a plain attribute rather than a JSON:API relationship — inconsistent with sibling configs using `STANDARD_ENTITY_RELS`
- `use-brand-detail.test.ts` has no coverage for `handleUpdateAccount`'s scope-toggle path
- `SidebarHeader.tsx` mounts a second brand switcher that nothing imports — dead code
- ~~`bun run check:ui-guards` is red on `master`~~ — green as of the storyboard-depth train. The `StoryboardWorkspace.tsx:70` bespoke card is gone: that local `SceneFrameRow` moved to `packages/pages/studio/storyboard/components/SceneFrameRow.tsx` and carries no surface token, because the parent `Card` already paints `bg-card`

## Boil-the-ocean backlog (next train)

Items 3 and 6 worked as one train on 2026-07-31 (`feat/studio-storyboard-depth`).

1. **Messages reply campaigns** — GH PRD under #1010 (throttled, not blast)
2. **Prompt-bar domain merge** — shell/notice only so far; full domain merge unfinished
- [x] 3. **Studio storyboard depth** — **done.** Five real defects, all found by reading the code rather than from the card text:
  - Scene generation had no cancellation. `VideosService.post` now takes an optional `AbortSignal`; `use-storyboard-workspace.ts` owns one `AbortController` per batch, checks `signal.aborted` before and after every request, and aborts on unmount. Cancelled frames are restored from `generating` to `pending` instead of being stranded
  - The batch always claimed success. It now counts outcomes and emits one of four accurate toasts (cancelled / all-succeeded / all-failed / partial), and per-frame errors carry the real message via `getErrorMessage` instead of a constant `'Generation failed'`
  - A failed frame was terminal — `getPendingFrames` only matched `status === 'pending'`. Added `getFailedFrames` in `storyboard-frame.schema.ts` behind a shared `isFrameGeneratable` predicate, wired to "Retry failed (N)" and a per-row Retry
  - `MergeProgressBars`, `useMergeProgress`, and `EaseCurveSelector` all existed, were tested, and had **zero production consumers**. They are now mounted: `isMerging` stays true until the socket reports done (it used to clear the instant the POST resolved, so a multi-minute render looked finished immediately), and a "Stop watching" control exists for when the socket goes quiet
  - `mergeSelectedVideos` hardcoded `isCaptionsEnabled: false` and dropped transitions. Both merge paths now spread the same `mergeSettings`, exposed through a new `MergeSettingsPanel` (transition, ease curve, duration, captions, mute)
  - Clips: **yes.** `/studio/clips` had a full page and a workspace-shell breadcrumb but no nav entry — reachable only by typing the URL. Added to the Automation group between Storyboard and Batch, with a test asserting the route is linked
- [x] 6. **Optional studio polish** past cards-above-prompt empty state — **done**, scoped to the storyboard surface: per-scene status pill (Ready/Generating/Completed/Failed) with a spinner over the thumbnail, video thumbnail preferred once a clip exists, inline failure reason, `Generating scene N of M` counter replacing the idle counts, and every control locked while a batch runs so a mid-flight edit cannot race the request
4. **Kit contrast / inputs polish** if still weak after Kit settings page
5. **Brand OverviewPanel** still has inline link editor path — align to modal like Social
7. **Agent / shell residual** polish from the same session branch if anything still feels off in prod

## Intent locked this session

- Equal shell padding
- Human vocabulary
- Config on dedicated settings routes
- 1–2 nav groups
- Social as own page; Interview inline + draft store; links as modal
- Studio Automation group: Storyboard, Clips, Batch, Fastlane (Clips added 2026-07-31 under backlog item 3 — it was an orphan route before)
- Flat master, keep QA together, no split for taste
