---
name: Motion only on the page menu
description: Product app elements do not animate; only the page menu (app rail + sidebar) and progress indicators keep motion
type: feedback
---

Product app UI elements switch state instantly: no hover/press/open/enter
transitions, no press scale, no hover-animated icons. The only exceptions are
the page menu (app rail and desktop sidebar, including their items, collapse
and drill-in) and progress indicators that must read as alive (Genfeed loader,
spinners, skeletons, progress bars).

**Why:** Vincent, QA 2026-10-15: "the animation on the searchbar icon is
useless. I don't think we need animation in elements but the pages menu item",
then chose a product-wide sweep over a local fix.

**How to apply:**
- The rule is enforced in one place: `packages/styles/motion-policy.css`,
  imported only by `apps/app/app/styles.css` (the marketing site keeps its
  motion). Do not re-add `transition-*`, `animate-*`, `active:scale-*` or
  framer-motion effects to elements expecting them to show; they collapse to
  0.01ms.
- A new page-menu surface opts in with `data-motion="allow"` on its container
  (see `AppRail.tsx` and `DesktopSidebar.tsx`). Nothing else opts in without
  an explicit user instruction.
- A new loader that must keep moving uses `animate-spin`, `animate-pulse`,
  `animate-shimmer`, a `genfeed-loader-*` class, or `role="progressbar"`.
- JS-driven motion (motion/react, animated icons) is not stopped by the CSS
  policy; keep it out of elements. `useHoverAnimatedIcon` stays only in page
  menu components.
- The contract is pinned by `apps/app/tests/theme-css-contract.test.ts`.
