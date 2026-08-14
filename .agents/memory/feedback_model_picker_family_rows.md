---
name: model picker family rows
description: Model picker All view lists collapsed families, not a second provider accordion
type: feedback
---

# Model picker is rail → family → variant

The model picker has two levels after the left provider rail: collapsed
**families**, then variants. The All view does not wrap catalogs in a
second provider accordion.

**Why:** Vincent rejected the All-view GenFeed / Fal / Unknown accordion —
the rail already picks the provider, and a third nest made Flux2 / SDXL
unusable.

**How to apply:**

- Keep the left rail as the provider filter.
- List collapsed families directly in All (static brand headings are fine).
- Do not add a clickable provider accordion in the list.
- Do not bucket leftover keys as **Unknown**. Map unsashed catalog keys
  (`runwayml`, `klingai-v2`, `sdxl`, `leonardoai`) to a real brand or
  list them as their own families.
