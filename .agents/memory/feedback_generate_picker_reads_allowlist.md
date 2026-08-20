---
name: generate picker reads allowlist
description: Generate/agent model pickers show only org-enabled models; Settings → Models stays the catalog
type: feedback
---

# Generate pickers read the org allowlist

If a model is disabled in the org, it must not appear in the generate or agent
model picker. Settings → Models stays the full catalog so operators can enable
rows.

**Why:** Demo Org Settings showed 72 models all OFF. The agent generate card
still listed Flux/Kling/Auto·Lowest Cost. Confirm 403'd in
`RouterService.selectModel` / `validateModelForOrg` when `enabledModelIds` was
empty. The server refuse was correct; the leak was the picker.

**How to apply:**

- Filter generate-card and agent chat pickers with `enabledModelIds` (id or key).
- Empty allowlist for that category: no Flux/Kling and no confirmable Auto.
- Show an explicit "No models enabled" state instead of a picker that 403s.
- Do not turn Settings → Models into a filtered list.
- Do not seed or flip live Demo toggles to hide the empty-allowlist case.
