-- Library character filter (#6039): `WHERE organizationId = ? AND personaId IN (...)
-- AND isDeleted = false ORDER BY createdAt DESC`. The existing persona index
-- leads with isDeleted and cannot serve a tenant-scoped lookup.
-- One concurrent build per migration avoids an implicit multi-statement transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ingredients_org_persona_created_at_idx"
ON "ingredients" ("organizationId", "personaId", "isDeleted", "createdAt" DESC);
