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
-- once keeps its earliest-created holder (lowest createdAt, then id; both are
-- server-controlled, unlike the client-suppliable publishedAt) and the other
-- holders are renamed to `<slug>-<last 12 chars of id>`. Nothing is deleted or
-- unpublished; renamed articles stay published under a new URL. If a generated
-- name collides with a slug that is already taken, the loop renames again until
-- every live published slug is unique (at most a few rounds, because each
-- suffix is derived from a unique row id). The platform organization cannot be
-- identified in SQL, so a platform article created after a tenant squatted the
-- same slug is also renamed; re-running the articles seed re-publishes the
-- canonical slug and archives the foreign holder.

DO $$
DECLARE
  renamed integer;
  round integer := 0;
BEGIN
  LOOP
    round := round + 1;
    IF round > 5 THEN
      RAISE EXCEPTION 'Migration aborted (#5904): published article slugs are still duplicated after % rename rounds', round - 1;
    END IF;

    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY slug
          ORDER BY "createdAt" ASC, id ASC
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

    GET DIAGNOSTICS renamed = ROW_COUNT;
    EXIT WHEN renamed = 0;
  END LOOP;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS "articles_public_slug_uidx"
  ON "articles" (slug)
  WHERE slug IS NOT NULL
    AND status = 'PUBLISHED'
    AND "isDeleted" = false;
