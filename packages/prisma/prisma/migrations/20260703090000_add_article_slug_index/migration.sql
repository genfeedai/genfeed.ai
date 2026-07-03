-- Public article pages resolve by slug (GET /v1/public/articles/slug/:slug,
-- ~2.6k req/week per Sentry) and the articles table had no slug index, so every
-- lookup sequential-scanned the table including its large `content` column.
--
-- CONCURRENTLY avoids ACCESS EXCLUSIVE locks on the articles table during deploy.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "articles_slug_idx"
ON "articles"("slug");
