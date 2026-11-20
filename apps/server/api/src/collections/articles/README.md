# Public article traffic

The app article list exposes a traffic dialog backed by `GET /articles/:articleId/website-traffic?period=7d|30d|90d|all`. It uses the authenticated organization, brand and article visibility boundary, then proves that the article owns the canonical public slug before querying PostHog.

## Server configuration

- `POSTHOG_QUERY_API_KEY`: server-only personal API key with query read access, scoped to the Genfeed project where possible. Never use the public ingestion token here or expose this key in a `NEXT_PUBLIC_*` variable.
- `POSTHOG_PROJECT_ID`: Genfeed project `192631` for production.
- `POSTHOG_QUERY_HOST`: `https://eu.posthog.com` for Genfeed, or `https://us.posthog.com` for a US project. Other origins are rejected before sending credentials.
- `GENFEEDAI_PUBLIC_URL`: canonical HTTPS publication origin; production is `https://genfeed.ai`.

Missing configuration and failed queries return unavailable with null totals. Zero means a successful query returned no events for that range. The query reads canonical article `$pageview` events and `article_cta_clicked` actions, excludes pageview preview tokens, and bins days in UTC. Today is partial; repeat visits count. Internal/test traffic and collection gaps can affect totals. Retention limits historical data.

Resource actions are clicks on the skill, Skills Pro, agent/MCP setup, or successful copies of the install command. They are not verified installs, signups or purchases. The new custom event has no history before deployment.

## Publication source

Website articles load from the production API database. The source seed catalog is an import, not an automatically deployed CMS. It refreshes existing article bodies, summaries, scope, brand, status and artwork metadata. Use a reviewed dry run and explicit production owner/organization and brand before a live seed. Preserve canonical URLs and publication dates on updates. For reviewed content, connect MCP with `https://mcp.genfeed.ai/mcp`. `save_post(action=article)` creates an HTML draft in the brand named by `brandId` (approval required) and `save_post(action=article_update)` edits an existing article's label, slug, summary, content and cover image without publishing. Set the cover with `coverImageUrl` and put inline images in the content as `<img src>` tags, both using the hosted https `url` of a Library asset (`get_assets`) or of a finished `upload_media` upload. Pass `brandId` on reads, updates and publishing when the article is not in the connection's active brand; the brand must belong to the organization and be one the caller can use. `get_content(action=article_preview)` returns a private expiring bearer URL, and `control_release(action=publish)` is the separate approval-required status change. In the Claude connector the publish call queues an approval that a reviewer releases in the app. `generate_content` with `type: "article"` remains the generation tool and saves a draft with an article id. Do not replace published canonical URLs.

Signed preview traffic is dropped from website analytics, and preview tokens are stripped from subsequent referrers. Preview URLs should never be embedded in public articles or application logs.

Preview links bind the exact article ID and slug, and issuing them follows the editor's organization, brand and visibility rules. Older slug-only links stop working after deployment; generate a fresh preview link. Preview requests bypass the public response cache.
