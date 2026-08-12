-- The id-DESC replacement is built concurrently by the immediately preceding
-- migration. Removing the old id-ASC index in a separate, transaction-safe
-- migration avoids combining DROP INDEX with CREATE INDEX CONCURRENTLY, which
-- Prisma 7 wraps in a transaction and PostgreSQL rejects with SQLSTATE 25001.
--
-- DROP INDEX is fast here because it only removes the already-replaced catalog
-- object; the expensive index build completed without blocking live writes.

DROP INDEX IF EXISTS "agent_messages_organizationId_threadId_isDeleted_createdAt_id_idx";
