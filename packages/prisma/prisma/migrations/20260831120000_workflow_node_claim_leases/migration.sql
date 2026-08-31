-- Give active synchronous workflow-node claims renewable, owner-tokened leases.
-- Nullable columns preserve compatibility with claims created before this migration.

ALTER TABLE "workflow_node_claims"
  ADD COLUMN IF NOT EXISTS "leaseOwnerId" TEXT,
  ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3);
