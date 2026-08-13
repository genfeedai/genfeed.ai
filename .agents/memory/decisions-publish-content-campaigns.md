---
name: Publish content campaigns decisions
description: Why Campaigns live in Publish, not a 10th module or Automate
type: project
status: planned
last_verified: 2026-08-13
---

# Publish Content Campaigns Decisions

## Optimization Target

One word ("Campaign") maps to one marketer job: plan and measure a cross-platform
content program. Avoid growing the app switcher and avoid forking Publish's
calendar/posts/analytics into a new module.

## Considered Approaches

1. **Tenth app-switcher module "Campaigns"**
   - Fails the module test: no root object today, destinations would duplicate
     Publish/Analytics, marketer would bounce Automate ↔ Campaigns for one launch.
2. **Keep everything under Automate "Campaigns"**
   - Collides agent Programs, outreach, and reply drip under a marketer word;
     already corrected in P0 nav/copy.
3. **Publish destination + `Campaign` model + `Post.campaignId`** (chosen)
   - Matches Publish as the content desk; calendar/posts/performance are
     campaign-scoped filters over surfaces that already exist — same pattern as
     Pipeline Review/Drafts/Published (`matchSearchParams`).

## Decision

Ship Campaigns as a first-class **Publish** destination backed by a new
`Campaign` entity and `Post.campaignId`. Automate configures production and
stamps the edge; Publish reports. Promote to a top-level module only if Campaigns
later owns 4+ distinct destinations and a persona that no longer fits Publish.

## Precedents

- [feedback_library_information_architecture.md](feedback_library_information_architecture.md)
  — destinations ≠ filters; do not invent modules per facet.
- [ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md](architecture/ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md)
  — workflow is the executable unit; campaigns are product views.
- [feedback_campaign_information_architecture.md](feedback_campaign_information_architecture.md)
  — naming + module home for Campaign vs Program vs outreach.
