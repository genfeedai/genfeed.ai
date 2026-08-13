---
name: Publish content campaigns
description: Multi-platform content Campaign model and Publish desk (calendar/content/performance)
type: project
status: planned
last_verified: 2026-08-13
---

# Publish Content Campaigns Spec

## Purpose

Give marketers a named, dated, cross-platform **Campaign** that consolidates
posts across TikTok, Instagram, X, and other connected accounts — calendar,
content board, and performance roll-up — inside **Publish**. This is the
product meaning of "Campaign". It is not an Automate agent Program, not an
outreach sequence, and not a reply drip.

## Non-Goals

- A 10th app-switcher module (keep Campaigns inside Publish until it owns 4+
  destinations and a persona that no longer fits the content desk).
- Renaming or migrating the `AgentCampaign` Prisma table (UI is already
  "Programs"; path `/automate/campaigns` stays for deep-link stability).
- Moving paid ads buying, budget pacing, or Discover Ads into this desk.
- Changing outreach / reply-drip execution models (already under Messages).

## Interfaces

### Data

- New `Campaign` model (org/brand scoped, `isDeleted: boolean`):
  - `id`, `organizationId`, `brandId`, `name`, `objective?`
  - `startDate?`, `endDate?`, `status` (string domain vocab, lowercase)
  - Optional budget fields only if product needs them in v1
- `Post.campaignId` nullable FK → `Campaign`
- Automate Programs / workflows / content runs **stamp** `campaignId` on posts
  they produce when the operator (or program config) selects a Campaign

### Nav / routes (Publish)

- `APP_ROUTES.PUBLISH.CAMPAIGNS` → `/publish/campaigns` (reclaim from the
  deprecated Automate alias once this ships)
- List → detail with tabs:
  - **Calendar** — existing Publish calendar filtered by `campaignId`
  - **Content** — Posts desk filtered by `campaignId`
  - **Performance** — Analytics roll-up filtered by `campaignId` (may deep-link
    into Analytics with campaign scope)

### Naming contract

| Concept | Word | Module |
|---|---|---|
| Multi-platform content program | **Campaign** | Publish |
| Agent budget/quota wrapper | **Program** | Automate → Agents |
| DM/growth sequence | **Outreach sequence** | Messages |
| Throttled reply sequence | **Reply drip** | Messages |

## Key Decisions

See [decisions-publish-content-campaigns.md](decisions-publish-content-campaigns.md).

## Edge Cases and Failure Modes

- Posts without `campaignId` remain first-class on the global Posts/Calendar
  desks; Campaign detail simply omits them.
- Soft-deleted campaigns hide from lists; posts keep the FK until reassigned.
- Tenant scope: every query includes `{ organizationId, isDeleted: false }`
  (and brand where brand-scoped).
- Legacy redirects: today's `/publish/campaigns` → `/automate/campaigns`
  (Programs) must flip to the new Publish Campaigns surface when P1 ships;
  Programs keep `/automate/campaigns`.

## Acceptance Criteria

- WHEN an operator opens Publish → Campaigns THE SYSTEM SHALL list Campaign
  rows for the current brand with name, dates, and status.
- WHEN a Campaign detail opens THE SYSTEM SHALL show Calendar, Content, and
  Performance views scoped to that Campaign's posts.
- WHEN a post is assigned `campaignId` THE SYSTEM SHALL surface it in that
  Campaign's Content and Calendar tabs.
- WHEN Automate produces posts for a selected Campaign THE SYSTEM SHALL stamp
  `campaignId` on those posts.
- THE SYSTEM SHALL NOT expose Agent Programs, Outreach sequences, or Reply
  drip under the word "Campaign" in nav or page titles.
