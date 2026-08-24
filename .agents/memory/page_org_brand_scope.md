---
name: page_org_brand_scope
description: Every customer list has org selected, brand empty, or brand selected
type: feedback
status: active
last_verified: 2026-08-24
topics: [navigation, tenancy, workflows, library]
---

**Rule:** Org is always selected. Brand is a three-state scope on every customer page, not a required filter.

| URL | Scope | List query |
| --- | --- | --- |
| `/:orgSlug/:brandSlug/…` | brand selected | pass `brandId` |
| `/:orgSlug/~/…` | brand empty | omit `brandId` (org collection) |
| org missing | invalid | do not fetch |

Clearing the brand switcher already navigates to `/:org/~` (`handleClearBrandSelection`). Pages must not `return` when `brandId` is empty on that route.

**Why:** Automate → Workflows ignored the URL brand and also refused to load without one, so FUD News showed every org clone and org `~` showed nothing.

**How to apply:**
- Use `useCollectionScope()` (`packages/hooks/navigation/use-collection-scope/`) for list fetches.
- `toBrandListParams(scope)` adds `brandId` only when a brand is selected.
- Do not gate org-scoped lists on `Boolean(brandId)`. Gate on `scope.isReady` (brand context already treats `~/` as ready without a brand).
- System-workflow clones stay out of the customer library regardless of scope.
