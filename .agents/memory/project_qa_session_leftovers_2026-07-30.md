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
- [x] Library nav + status filters + AppSwitcher underlines — nav/filter wiring correct; **fixed** duplicate voices status options. AppSwitcher has no underline by design (removed in #2204; active state is the filled icon tile)

**Not verified in a browser.** The dev app boots, but every protected route
bounces to `/login` and there is no non-interactive way in: passwords are
off-limits to the agent, and the magic-link URL is deliberately never logged
(`better-auth-mailer.service.ts` logs `emailDomain` only). A seeded local
account, or a documented self-hosted dev sign-in, would unblock browser QA for
the next train.

## Still open from this train

- `LinksController.buildFindAllQuery` filters on raw `where.brand`; `normalizeWhere` only remaps writes, so the standalone `GET /links?brand=` path is unmapped. Not on the modal's path (the Social page reads links through `brand.links`)
- `link.config.ts` uses `simpleConfig`, so `brand` is a plain attribute rather than a JSON:API relationship — inconsistent with sibling configs using `STANDARD_ENTITY_RELS`
- `use-brand-detail.test.ts` has no coverage for `handleUpdateAccount`'s scope-toggle path
- `SidebarHeader.tsx` mounts a second brand switcher that nothing imports — dead code
- `bun run check:ui-guards` is red on `master` for hardcoded routes in `playwright/e2e/tests/library/content-library.spec.ts` and `.../core/automation-loop.spec.ts` — pre-existing, untouched by this train

## Boil-the-ocean backlog (next train)

1. **Messages reply campaigns** — GH PRD under #1010 (throttled, not blast)
2. **Prompt-bar domain merge** — shell/notice only so far; full domain merge unfinished
3. **Studio storyboard depth** — scene gen reliability, merge polish, Clips in Automation menu if desired
4. **Kit contrast / inputs polish** if still weak after Kit settings page
5. **Brand OverviewPanel** still has inline link editor path — align to modal like Social
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
