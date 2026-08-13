---
name: Campaign information architecture
description: Campaign means Publish content programs; Automate uses Programs; outreach lives in Messages
type: feedback
---

One product word for "Campaign": a marketer's named, dated, cross-platform
content program in **Publish**. Do not add a tenth app-switcher module for it.

**Why:** Automate previously grouped AgentCampaigns, outreach, replies, and
reply drip under a "Campaigns" nav label. Marketers looking for TikTok/IG/X
content consolidation landed in agent plumbing. The multi-platform desk needs
`Post.campaignId` and belongs with calendar/posts/performance — Publish.

**How to apply:**

- Nav/UI: Automate → Agents → **Programs** (`/automate/campaigns`); Messages →
  Outreach sequences / Replies / Reply drip; Publish → **Campaigns** when the
  P1 model ships ([spec-publish-content-campaigns.md](spec-publish-content-campaigns.md)).
- Never title outreach "Marketing Campaigns".
- Do not promote Campaigns to the app switcher unless it owns 4+ destinations
  and a persona that no longer fits Publish.
