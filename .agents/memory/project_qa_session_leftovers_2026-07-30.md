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
- `use-brand-detail.test.ts` has no coverage for `handleUpdateAccount`'s scope-toggle path
- `SidebarHeader.tsx` mounts a second brand switcher that nothing imports — dead code
- `bun run check:ui-guards` is red on `master` on two required guards — hardcoded routes in `playwright/e2e/tests/{library/content-library,core/automation-loop}.spec.ts`, and a bespoke card at `StoryboardWorkspace.tsx:70`. Pre-existing, untouched by this train, chipped to its own session

## Boil-the-ocean backlog (next train)

1. **Messages reply campaigns** — GH PRD under #1010 (throttled, not blast)
2. **Prompt-bar domain merge** — shell/notice only so far; full domain merge unfinished
3. **Studio storyboard depth** — scene gen reliability, merge polish, Clips in Automation menu if desired
4. - [x] **Kit contrast / inputs polish** if still weak after Kit settings page — re-checked on `fix/brand-link-modal-and-kit-polish`; still weak, so polished. Two real defects in `BrandDetailManualKitCard.tsx`: (a) every manual-kit field was placeholder-only with an `aria-label` and no visible label, so three adjacent hex inputs became indistinguishable the moment you typed — now wrapped in `FormControl` (`Label` by hand for `ColorField`/`Select`, whose single-child clone would collide with the control's own `id`); (b) the draft-review panel was `bg-background-secondary` with its selectable field rows painted the *same* `bg-background-secondary`, separated only by `shadow-border` — rows stepped down to `bg-background`. No other Kit surface was touched
5. - [x] **Brand OverviewPanel** still has inline link editor path — align to modal like Social — **done.** `BrandDetailLinkEditor.tsx` (+ its test) deleted, and the five inline handlers plus four `useState` pairs removed from `useModalBrand.ts`. `ModalBrand.tsx` now mounts `LazyModalBrandLink` as a sibling and `handleOpenLinkModal` fires `openModal(ModalEnum.BRAND_LINK)` — byte-for-byte the Social settings page's pattern (`settings/social/content.tsx`). Open/save/cancel/delete covered in `ModalBrandLink.test.tsx`; the open path is guarded in `ModalBrand.test.tsx`
6. **Optional studio polish** past cards-above-prompt empty state
7. **Agent / shell residual** polish from the same session branch if anything still feels off in prod

## Intent locked this session

- Equal shell padding
- Human vocabulary
- Config on dedicated settings routes
- 1–2 nav groups
- Social as own page; Interview inline + draft store; links as modal
- Studio Automation group: Storyboard, Batch, Fastlane
- Flat master, keep QA together, no split for taste
