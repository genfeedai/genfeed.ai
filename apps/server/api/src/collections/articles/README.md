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

Website articles load from the production API database. The source seed catalog is an import, not an automatically deployed CMS. It refreshes existing article bodies, summaries, scope, brand, status and artwork metadata. Use a reviewed dry run and explicit production owner/organization and brand before a live seed. Preserve canonical URLs and publication dates on updates. For reviewed content, connect MCP with `https://mcp.genfeed.ai/mcp?toolsets=content,articles`. The optional `articles` toolset offers `create_article_draft` (full HTML, approval required), `get_article_preview` (private expiring bearer URL), and `publish_article` (separate approval-required status change). The default profile stays within its existing tool cap. `create_article` remains the generation tool. Edit existing drafts in the app before publishing; do not replace published canonical URLs.

Signed preview traffic is dropped from website analytics, and preview tokens are stripped from subsequent referrers. Preview URLs should never be embedded in public articles or application logs.
