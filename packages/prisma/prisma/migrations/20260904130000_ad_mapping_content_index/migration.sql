-- Prisma JSON path equals emits #> with a text[] path and a JSONB value.
-- Keep the JSONB expression: ->> would not match the service predicate.
-- One concurrent build per migration avoids an implicit multi-statement transaction.
CREATE INDEX CONCURRENTLY "ad_mappings_org_deleted_content_idx"
ON "ad_creative_mappings" ("organizationId", "isDeleted", ("data" #> '{genfeedContentId}'::text[]));
