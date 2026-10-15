-- Supporting index for latestDisplayableEvaluationsQuery, which attaches the
-- latest evaluation to every row of the ingredients, images, videos and posts
-- list pages. It joins on ("organizationId", "contentType", "contentId") and
-- ranks by "updatedAt" DESC; the only existing index is
-- ("organizationId", "isDeleted", "updatedAt"), so each page scanned every
-- evaluation in the organization.
--
-- Synthetic benchmark (150k evaluations in one org, 30 targets, Postgres 16):
-- 18.6 ms / 4,954 buffers → 0.2 ms / 9 buffers per list page.
--
-- Built CONCURRENTLY so evaluation writes are not blocked; one statement per
-- migration so Prisma runs it outside a transaction. If the build fails it
-- leaves an INVALID index of the same name; drop it before retrying.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "evaluations_org_content_target_idx"
  ON "evaluations" ("organizationId", "contentType", "contentId", "isDeleted", "updatedAt" DESC);
