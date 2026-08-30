-- Referral grants and compensating reversals use durable idempotency keys.
-- Partial predicates are not representable in schema.prisma. Keep this as a
-- bare CONCURRENTLY statement so the hot credit ledger remains writable while
-- the index builds.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "credit_transactions_org_idempotency_key"
  ON "credit_transactions" ("organizationId", "idempotencyKey")
  WHERE "isDeleted" = false
    AND "idempotencyKey" IS NOT NULL;
