-- Build the candidate key outside the constraint migration so campaign writes
-- remain available while PostgreSQL scans existing rows.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "campaigns_id_organizationId_brandId_key"
ON "campaigns"("id", "organizationId", "brandId");
