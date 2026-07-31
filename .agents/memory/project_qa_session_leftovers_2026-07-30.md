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
- ~~`use-brand-detail.test.ts` has no coverage for `handleUpdateAccount`'s scope-toggle path~~ — **closed 2026-07-31.** Confirmed real (the file had 4 tests, none touching `handleUpdateAccount`). Added a `handleUpdateAccount scope toggle` describe with 5 tests over `use-brand-detail.ts:334-382`: optimistic flip before the patch resolves, persist `BRAND → PUBLIC`, persist `PUBLIC → BRAND`, rollback + `NotificationsService.error` on rejection, and the `isUpdatingRef` in-flight guard
- ~~`SidebarHeader.tsx` mounts a second brand switcher that nothing imports — dead code~~ — **closed 2026-07-31.** Confirmed unreferenced (no import site, no barrel re-export, no dynamic import; the `sidebar-header-shell` testid at `MenuShared.tsx:178` and the CSS class in desktop `Sidebar.tsx:122` are unrelated). Deleted `packages/ui/src/components/menus/sidebar-header/` and its only consumer type `packages/props/navigation/sidebar-header.props.ts`. The live switcher stays `MenuBrandSwitcher` at `AppProtectedTopbar.tsx:275`
- `bun run check:ui-guards` is red on `master` on two required guards — hardcoded routes in `playwright/e2e/tests/{library/content-library,core/automation-loop}.spec.ts`, and a bespoke card at `StoryboardWorkspace.tsx:70`. Pre-existing, untouched by this train, chipped to its own session

## Boil-the-ocean backlog (next train)

1. **Messages reply campaigns** — GH PRD under #1010 (throttled, not blast)
2. **Prompt-bar domain merge** — shell/notice only so far; full domain merge unfinished
3. **Studio storyboard depth** — scene gen reliability, merge polish, Clips in Automation menu if desired
4. **Kit contrast / inputs polish** if still weak after Kit settings page
5. **Brand OverviewPanel** still has inline link editor path — align to modal like Social
6. **Optional studio polish** past cards-above-prompt empty state
7. ~~**Agent / shell residual** polish from the same session branch~~ — **done 2026-07-31.** Swept #2199, #2204 and #2206 against ADR-CONVERSATION-SHELL-CONTRACTS v3.2. One real regression: #2204 merged after #2206 and reinstated the inline `AgentThreadListProps` duplicate that #2206 (`3e3ad4163`) had deleted, so `app-protected-layout.tsx` shadowed the canonical `@genfeedai/agent` type and had already drifted from it (missing `onActionsChange`). Restored the package import. Verified the other 10 files #2206 touched: 7 byte-unchanged, 3 (`AgentChatInputToolbar.tsx`, `AgentModelSelector.tsx`, `useAgentChatInput.ts`) legitimately evolved forward with #2206's fixes intact. ADR invariants re-checked and clean: #11 frame is route-decided (`AgentWorkspaceLayoutClient.tsx` renders children regardless of `isLoaded`), #12/#13 single-owner conversation and nav column (`UniversalWorkspaceShell.tsx:871-897`, `1049-1058`), collapse-is-not-unmount (`inert={!isInspectorOpen}` at `:1188` plus `forceMount` tabs at `:940-966`). Prompt-bar/composer domain layer left untouched — that is backlog item 2

## Intent locked this session

- Equal shell padding
- Human vocabulary
- Config on dedicated settings routes
- 1–2 nav groups
- Social as own page; Interview inline + draft store; links as modal
- Studio Automation group: Storyboard, Batch, Fastlane
- Flat master, keep QA together, no split for taste
