---
name: Long-form delivery
description: Composer Articles and Newsletters reach connected long-form accounts through one-target scheduler releases, never a parallel publish path
type: decision
last_verified: 2026-10-13
---

**Decision (#6753, #6764):** an Article delivers to a connected Ghost, WordPress,
Medium or Dev.to account, and a Newsletter to a connected Beehiiv publication,
as an ordinary one-target scheduler release (`PostGroupsService.create` +
`publishNow`, or a scheduled release). The target Post links back through
`entityArticleId` / `entityNewsletterId` (`PostGroupCreateProvenance.sourceArticleId`
/ `sourceNewsletterId`). Entry points: `POST|GET /articles/:id/deliveries`,
`POST|GET /newsletters/:id/deliveries` (`collections/long-form-deliveries`).

**Why:** validation, readiness, approval, retries, provider verification and
URL capture stay the scheduler's own, and the MCP scheduler tools
(`create_scheduled_release`) reach the same accounts without a new tool.
Dev.to publishing uses that same path (`DevtoPublisherService`).

**How to apply:**
- Ghost, WordPress, Medium and Dev.to are `supported` channel capabilities.
  Medium publishes through `MediumPublisherService` and Dev.to through
  `DevtoPublisherService` in the publisher factory. Article delivery is the
  publish path. `POST /services/devto/connect` remains the connect route.
- `Article.content` stores HTML. YouTube long-form ingest converts its Markdown
  with `renderNewsletterHtml` before `article.create`. Dev.to is the
  Markdown-only target, so the Dev.to publisher converts stored HTML to
  Markdown at publish. Newsletters stay Markdown.
- Newsletter Markdown renders through `renderNewsletterHtml`, shared with the
  Substack import feed (`GET /public/rss/brands/:brandId/newsletters`).
  Substack has no publishing API (#2087).
- Customer content never goes to genfeed.ai (`PublicArticleScope`).
  `publish_article` keeps its workspace/genfeed.ai publish semantics.
- `externalUrl` on Article and Newsletter records a link published outside
  Genfeed.
