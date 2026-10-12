---
name: Long-form delivery
description: Composer Articles and Newsletters reach connected long-form accounts through one-target scheduler releases, never a parallel publish path
type: decision
last_verified: 2026-10-12
---

**Decision (#6753):** an Article delivers to a connected Ghost, WordPress or
Medium account, and a Newsletter to a connected Beehiiv publication, as an
ordinary one-target scheduler release (`PostGroupsService.create` +
`publishNow`, or a scheduled release). The target Post links back through
`entityArticleId` / `entityNewsletterId` (`PostGroupCreateProvenance.sourceArticleId`
/ `sourceNewsletterId`). Entry points: `POST|GET /articles/:id/deliveries`,
`POST|GET /newsletters/:id/deliveries` (`collections/long-form-deliveries`).

**Why:** validation, readiness, approval, retries, provider verification and
URL capture stay the scheduler's own, and the MCP scheduler tools
(`create_scheduled_release`) reach the same accounts without a new tool.

**How to apply:**
- Ghost, WordPress and Medium are `supported` channel capabilities;
  Medium publishes through `MediumPublisherService` in the publisher factory.
  Do not add an article-only publisher or route.
- Newsletter Markdown renders through `renderNewsletterHtml`, shared with the
  Substack import feed (`GET /public/rss/brands/:brandId/newsletters`).
  Substack has no publishing API (#2087).
- Customer content never goes to genfeed.ai (`PublicArticleScope`).
  `publish_article` keeps its workspace/genfeed.ai publish semantics.
- `externalUrl` on Article and Newsletter records a link published outside
  Genfeed.
