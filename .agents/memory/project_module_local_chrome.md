---
name: module-local-chrome
description: One app pattern for local nav + primary actions via SectionTopbar
type: project
---

# Module-local chrome (SectionTopbar)

**Why:** Discover Socials looked “right” while Ads, Models, admin lists, and analytics
tools looked convoluted because pages mixed `Container` title toolbars, orphan body
`tabs` strips, and hand-rolled `border-b` rows. There is one contract for sibling
surfaces + primary tools — not a Discover-only flourish.

**How to apply:**

1. **Primitive:** `@ui/layout/section-topbar/SectionTopbar` — full-bleed `border-b`,
   tabs left, primary actions right. `titleVisibility`: `auto` | `visible` | `sr-only`.
2. **Preferred page API:** `Container` with `headerTabs` + `right` (and
   `titleVisibility="sr-only"` when the shell breadcrumb owns identity).
3. **Container auto-emits SectionTopbar when:**
   - `headerTabs` is set
   - body `tabs` + `right` (promoted)
   - body `tabs` alone (lifted — no orphan strip)
   - chrome-only title (`sr-only` / breadcrumb) + `right` tools
4. **Keep classic padded title toolbar for:** visible title + create/invite CTA only
   (no local tab nav). That is not module chrome.
5. **Sibling composition (Discover Socials / content runs):**
   `<SectionTopbar … />` then chrome-less `<Container>{body}</Container>`. Do not nest
   SectionTopbar *inside* Container or leave SocialsNavigation outside the `tabs` slot.
6. **Never** stuff platform/filter `Tabs` into `Container`’s `right` slot and
   `justify-between` them — use `headerTabs` + `right` actions.

**Marker:** module shells set `data-module-chrome="section-topbar" | "classic"` on
the Container root (`data-testid="container"`).

**Out of scope for this contract:** detail `PageHeader` (back + title), modal chrome,
workflow canvas toolbars, one-off content cards (e.g. Skills filter chips).

## Discover Following IA

- **Following** is a Discover **sidebar peer** (`/discover/following`), not a Socials
  sub-tab. Socials tabs = Overview + platform feeds only.
- Following page is a **global brand feed** (all followed accounts / platforms).
- **Follow source** and **Manage sources** are **modals** — never a permanent left
  column next to an empty feed.
- Filters (search / platform) appear only when there is feed content (or an active
  filter), not as empty-state furniture.

## Following collector (X timelines)

- Prefer **official X API v2** (`TwitterService.getUserTimelineByUsername`) when
  `TWITTER_BEARER_TOKEN` is configured; **Apify** is fallback only.
- Following sync uses `includeReplies: true` (reply-bot defaults still strip replies).
- Apify timeline **throws** on missing token / actor failure — never silent `[]`
  success. `lastSyncStatus`: `success` | `empty` | `failed` + `lastSyncError`.
- UI must toast real post counts / failures, not only “Sources synced”.
