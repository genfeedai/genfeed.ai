---
name: qa-session-leftovers-2026-07-30
description: Leftovers from continuous product QA session after PR #2204 — boil the ocean next
type: project
---

# QA session leftovers (after #2204)

**Why:** Session was too long to finish everything. Merge #2204 to flat `master`, then continue these in the next QA train. Do not drop them.

**How to apply:** After #2204 lands, open a fresh branch from `master` and work this list as one continuous QA stream (keep QA together).

## Must verify (product)

- [ ] Social: Add/Edit link modal + POST `/v1/links` after `brand` → `brandId` map
- [ ] Public Profile toggle sticks (scope case + Switch label)
- [ ] Interview draft store survives reload
- [ ] Studio Video empty: no Frame Sequence block
- [ ] Studio Storyboard: Frame sequence / Scenes / Merge modes work end-to-end
- [ ] Brand switcher: active row selected wash
- [ ] Library nav + status filters + AppSwitcher underlines

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
