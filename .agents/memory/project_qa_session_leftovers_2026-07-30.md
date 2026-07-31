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

- ~~`LinksController.buildFindAllQuery` filters on raw `where.brand`; `normalizeWhere` only remaps writes, so the standalone `GET /links?brand=` path is unmapped~~ — **fixed** (`fix/brand-link-modal-and-kit-polish`). The claim was half right: `processSearchParams`' generic `${key}Id` fallback (`base.service.ts:1170-1187`) *does* map a non-empty string `brand` → `brandId`, so the string path already worked. The real hole was the `undefined` path — a superadmin with neither `?brand=` nor a session brand produced `where.brand = undefined`, which `normalizeWhere` (`base.service.ts:647-650`) drops, and since `model Link` (`schema.prisma:1888`) has **no `organizationId`** that widened the read to every link in the database. `buildFindAllQuery` now emits the scalar `brandId` through `requireRelationId`, which fails closed with `BadRequestException`. Covered by three cases in `links.controller.spec.ts`
- ~~`link.config.ts` uses `simpleConfig`, so `brand` is a plain attribute rather than a JSON:API relationship~~ — **fixed.** Now `{ attributes: linkAttributes, brand: BRAND_REL, type: 'link' }`, matching `folder.config.ts` / `watchlist.config.ts` (Link has only a brand relation, so no `STANDARD_ENTITY_RELS` spread). Regression test in `packages/serializers/__tests__/server-serializers.test.ts`
- ~~`use-brand-detail.test.ts` has no coverage for `handleUpdateAccount`'s scope-toggle path~~ — **closed 2026-07-31.** Confirmed real (the file had 4 tests, none touching `handleUpdateAccount`). Added four scope-toggle tests over `use-brand-detail.ts:342-392`: optimistic flip before the patch resolves, persist `BRAND → PUBLIC`, persist `PUBLIC → BRAND`, and rollback + `NotificationsService.error` on rejection. Concurrent saves are covered separately by the queued-save regression test added with `useSaveQueue`
- ~~`SidebarHeader.tsx` mounts a second brand switcher that nothing imports — dead code~~ — **closed 2026-07-31.** Confirmed unreferenced (no import site, no barrel re-export, no dynamic import; the `sidebar-header-shell` testid at `MenuShared.tsx:178` and the CSS class in desktop `Sidebar.tsx:122` are unrelated). Deleted `packages/ui/src/components/menus/sidebar-header/` and its only consumer type `packages/props/navigation/sidebar-header.props.ts`. The live switcher stays `MenuBrandSwitcher` at `AppProtectedTopbar.tsx:275`
- ~~`bun run check:ui-guards` is red on `master` on two required guards — hardcoded routes in `playwright/e2e/tests/{library/content-library,core/automation-loop}.spec.ts`, and a bespoke card at `StoryboardWorkspace.tsx:70`~~ — **fixed** in the session it was chipped to. Re-ran on 2026-07-31 against `master`: all seven required guards pass (`UI guards passed.`). Three `styled-anchor` violations remain and are advisory-only existing debt, not a gate — `OrganizationAutomationOverviewPage.tsx:174`, `AppProtectedLayoutAgentSidebar.tsx:30`, `asset-gate-guard.tsx:79`

**This train is closed.** Every residual above is struck with evidence. Remaining
work lives in the boil-the-ocean backlog below, not here.

## Boil-the-ocean backlog (next train)

Items 3 and 6 worked as one train on 2026-07-31 (`feat/studio-storyboard-depth`).

1. **Messages reply campaigns** — GH PRD under #1010 (throttled, not blast)
2. ~~**Prompt-bar domain merge**~~ — **done.** `PromptBarArticle` and `PromptBarPost` are deleted;
   every content surface renders `PromptBarContent`, and submit/Enter/trim/clear is one primitive
   (`usePromptBarSubmission`) shared with `PostEnhancementBar`
- [x] 3. **Studio storyboard depth** — **done.** Five real defects, all found by reading the code rather than from the card text:
  - Scene generation had no cancellation. `VideosService.post` now takes an optional `AbortSignal`; `use-storyboard-workspace.ts` owns one `AbortController` per batch, checks `signal.aborted` before and after every request, and aborts on unmount. Cancelled frames are restored from `generating` to `pending` instead of being stranded
  - The batch always claimed success. It now counts outcomes and emits one of four accurate toasts (cancelled / all-succeeded / all-failed / partial), and per-frame errors carry the real message via `getErrorMessage` instead of a constant `'Generation failed'`
  - A failed frame was terminal — `getPendingFrames` only matched `status === 'pending'`. Added `getFailedFrames` in `storyboard-frame.schema.ts` behind a shared `isFrameGeneratable` predicate, wired to "Retry failed (N)" and a per-row Retry
  - `MergeProgressBars`, `useMergeProgress`, and `EaseCurveSelector` all existed, were tested, and had **zero production consumers**. They are now mounted: `isMerging` stays true until the socket reports done (it used to clear the instant the POST resolved, so a multi-minute render looked finished immediately), and a "Stop watching" control exists for when the socket goes quiet
  - `mergeSelectedVideos` hardcoded `isCaptionsEnabled: false` and dropped transitions. Both merge paths now spread the same `mergeSettings`, exposed through a new `MergeSettingsPanel` (transition, ease curve, duration, captions, mute)
  - Clips: **yes.** `/studio/clips` had a full page and a workspace-shell breadcrumb but no nav entry — reachable only by typing the URL. Added to the Automation group between Storyboard and Batch, with a test asserting the route is linked
- [x] 6. **Optional studio polish** past cards-above-prompt empty state — **done**, scoped to the storyboard surface: per-scene status pill (Ready/Generating/Completed/Failed) with a spinner over the thumbnail, video thumbnail preferred once a clip exists, inline failure reason, `Generating scene N of M` counter replacing the idle counts, and every control locked while a batch runs so a mid-flight edit cannot race the request
4. - [x] **Kit contrast / inputs polish** if still weak after Kit settings page — re-checked on `fix/brand-link-modal-and-kit-polish`; still weak, so polished. Two real defects in `BrandDetailManualKitCard.tsx`: (a) every manual-kit field was placeholder-only with an `aria-label` and no visible label, so three adjacent hex inputs became indistinguishable the moment you typed — now wrapped in `FormControl` (`Label` by hand for `ColorField`/`Select`, whose single-child clone would collide with the control's own `id`); (b) the draft-review panel was `bg-background-secondary` with its selectable field rows painted the *same* `bg-background-secondary`, separated only by `shadow-border` — rows stepped down to `bg-background`. No other Kit surface was touched
5. - [x] **Brand OverviewPanel** still has inline link editor path — align to modal like Social — **done.** `BrandDetailLinkEditor.tsx` (+ its test) deleted, and the five inline handlers plus four `useState` pairs removed from `useModalBrand.ts`. `ModalBrand.tsx` now mounts `LazyModalBrandLink` as a sibling and `handleOpenLinkModal` fires `openModal(ModalEnum.BRAND_LINK)` — byte-for-byte the Social settings page's pattern (`settings/social/content.tsx`). Open/save/cancel/delete covered in `ModalBrandLink.test.tsx`; the open path is guarded in `ModalBrand.test.tsx`
7. ~~**Agent / shell residual** polish from the same session branch~~ — **done 2026-07-31.** Swept #2199, #2204 and #2206 against ADR-CONVERSATION-SHELL-CONTRACTS v3.2. One real regression: #2204 merged after #2206 and reinstated the inline `AgentThreadListProps` duplicate that #2206 (`3e3ad4163`) had deleted, so `app-protected-layout.tsx` shadowed the canonical `@genfeedai/agent` type and had already drifted from it (missing `onActionsChange`). Restored the package import. Verified the other 10 files #2206 touched: 7 byte-unchanged, 3 (`AgentChatInputToolbar.tsx`, `AgentModelSelector.tsx`, `useAgentChatInput.ts`) legitimately evolved forward with #2206's fixes intact. ADR invariants re-checked and clean: #11 frame is route-decided (`AgentWorkspaceLayoutClient.tsx` renders children regardless of `isLoaded`), #12/#13 single-owner conversation and nav column (`UniversalWorkspaceShell.tsx:871-897`, `1049-1058`), collapse-is-not-unmount (`inert={!isInspectorOpen}` at `:1188` plus `forceMount` tabs at `:940-966`). Prompt-bar/composer domain layer left untouched — that is backlog item 2

## Intent locked this session

- Equal shell padding
- Human vocabulary
- Config on dedicated settings routes
- 1–2 nav groups
- Social as own page; Interview inline + draft store; links as modal
- Studio Automation group: Storyboard, Clips, Batch, Fastlane (Clips added 2026-07-31 under backlog item 3 — it was an orphan route before)
- Flat master, keep QA together, no split for taste
