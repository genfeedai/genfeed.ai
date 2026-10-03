-- Make public article slugs unique (#5904).
--
-- Background
-- ----------
-- The public site serves `/articles/:slug` from one global namespace, but
-- `articles.slug` only had a plain index, so two tenants could publish the same
-- slug and the lookup returned whichever row Postgres yielded first (a tenant
-- could shadow a canonical Genfeed article).
--
-- Constraint
-- ----------
-- At most one live published article per slug. Drafts and archived rows may
-- still share a slug; Prisma cannot express the WHERE clause, so the index is
-- SQL-only (see the comment on `Article` in schema.prisma).
--
-- Existing duplicates
-- -------------------
-- Before the index is built, every live published slug that is held more than
-- once keeps its earliest release (lowest publishedAt, then createdAt, then
-- id) and the later holders are renamed to `<slug>-<last 12 chars of id>`.
-- Nothing is deleted or unpublished; the renamed articles stay published under
-- a new, unique URL. The rename suffix is derived from the unique row id, so it
-- cannot collide among the renamed rows.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY slug
      ORDER BY "publishedAt" ASC NULLS LAST, "createdAt" ASC, id ASC
    ) AS rn
  FROM "articles"
  WHERE slug IS NOT NULL
    AND status = 'PUBLISHED'
    AND "isDeleted" = false
)
UPDATE "articles" AS a
SET    slug = LEFT(a.slug, 180) || '-' || RIGHT(a.id, 12),
       "updatedAt" = NOW()
FROM   ranked
WHERE  a.id = ranked.id
  AND  ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "articles_public_slug_uidx"
  ON "articles" (slug)
  WHERE slug IS NOT NULL
    AND status = 'PUBLISHED'
    AND "isDeleted" = false;
