-- The partial soft-delete-aware replacement is built concurrently by the
-- immediately preceding migration. Removing the old full unique index in a
-- separate, transaction-safe migration keeps the preceding file limited to
-- bare CREATE INDEX CONCURRENTLY statements, which Prisma executes outside a
-- transaction block.
--
-- DROP INDEX is fast here because it only removes the already-replaced catalog
-- object; the expensive index build completed without blocking live writes.

DROP INDEX IF EXISTS "credit_balances_organizationId_key";
