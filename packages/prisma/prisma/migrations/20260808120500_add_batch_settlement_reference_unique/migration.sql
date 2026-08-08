-- A stable batch settlement reference makes retries safe when the balance
-- transaction committed but a later notification/cache side effect threw.
-- The marker guard rejects stale sweep results; this database invariant is the
-- final guard against concurrent or ambiguous duplicate deductions.
--
-- Partial predicates cannot be represented in schema.prisma. Keep this as a
-- bare CONCURRENTLY statement so the hot credit ledger remains writable while
-- the index builds.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "credit_transactions_batch_settlement_reference_key"
  ON "credit_transactions" ("organizationId", "referenceType", "referenceId")
  WHERE "isDeleted" = false
    AND "referenceId" IS NOT NULL
    AND "referenceType" = 'batch-generation:settlement';
