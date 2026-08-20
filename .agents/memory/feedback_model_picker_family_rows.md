---
name: model picker flat rows
description: Model picker is one flat ranked list with filter pills and a hover spec — no rail, no accordion
type: feedback
---

# Model picker is a flat ranked list

Every model is a single row. Favorites → Recent → All models, one section
each, disjoint, so a model appears exactly once. Search collapses all of it
into one result list.

**Why:** the rail → source tabs → brand heading → collapsed family → variant
stack put five levels between opening the picker and clicking a model, and
still hid what the models actually differ on. Vincent asked for alternatives;
the flat command list won.

**How to apply:**

- One row per model. No provider rail, no source tab strip, no clickable
  family or provider accordion. The provider is a mark on the row.
- Structural narrowing is the **filter pill row** — `All`, one pill per source
  group, capability pills (Fast / Audio / Cheapest), and `Legacy`. One pill
  active at a time. A pill only renders when the current catalog has a model
  behind it; a dead filter is not a control.
- Legacy models stay out of every view except the Legacy pill — but search
  still reaches them, so a retired model's name always finds it.
- Row detail is **icons, never words**: capability icons carry an `aria-label`
  so the accessible name survives without the row printing "Audio".
- Everything the row drops — description, speed, quality, cost, durations,
  ratios, outputs, best-for, full capability list, and any lock reason — lives
  in the **hover spec** (`ModelSelectorModelSpec` in a tooltip). Hover, not
  focus: cmdk keeps DOM focus on the search input during arrow navigation.
- Recency is device-local (`useModelRecents`, localStorage) and owned by the
  picker. It is not a user setting and no host plumbs it.
- Map unsashed catalog keys (`runwayml`, `klingai-v2`, `sdxl`, `leonardoai`)
  to a real brand. Do not bucket leftovers as **Unknown**.
