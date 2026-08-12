-- Recreate the agent_messages hot-path index with a matching "id" sort
-- direction for keyset/cursor pagination (#2791).
--
-- Query shape: AgentMessagesService now paginates thread messages via
--   ORDER BY "createdAt" DESC, "id" DESC
-- (apps/server/api/src/collections/agent-messages/services/agent-messages.service.ts,
-- queryMessagesByRoom — the composite (createdAt, id) cursor tiebreaker).
-- The existing index
--   agent_messages_organizationId_threadId_isDeleted_createdAt_id_idx
-- declares "id" ASC (Prisma's default), so neither a forward index scan
-- (createdAt DESC, id ASC) nor a backward scan (createdAt ASC, id DESC)
-- matches that order — Postgres has to add an extra Sort node over every
-- qualifying row of the thread before applying LIMIT.
--
-- Recreating the index with "id" DESC lets a forward Index Scan return rows
-- already in the exact order the cursor query needs, so LIMIT can stop early
-- without materializing/sorting the full thread's message history.
--
-- IMPORTANT (#1626): Do NOT use DROP INDEX CONCURRENTLY here. Prisma only
-- skips the migration transaction for bare `CREATE INDEX CONCURRENTLY`
-- statements (see prisma/prisma#14456 and
-- 20260807150000_add_hot_path_indexes). `DROP INDEX CONCURRENTLY` still runs
-- inside a transaction and fails with:
--   ERROR: DROP INDEX CONCURRENTLY cannot run inside a transaction block
-- which broke nightly API E2E / Authed E2E migrate deploy (P3018).
--
-- Plain DROP + CREATE is acceptable: the rebuild is a single btree on
-- agent_messages and the lock window is short relative to chat traffic.
-- `IF EXISTS` / `IF NOT EXISTS` make both statements no-ops if already applied.

DROP INDEX IF EXISTS "agent_messages_organizationId_threadId_isDeleted_createdAt_id_idx";

CREATE INDEX IF NOT EXISTS "agent_messages_organizationId_threadId_isDeleted_createdAt_id_idx"
  ON "agent_messages" ("organizationId", "threadId", "isDeleted", "createdAt" DESC, "id" DESC);
