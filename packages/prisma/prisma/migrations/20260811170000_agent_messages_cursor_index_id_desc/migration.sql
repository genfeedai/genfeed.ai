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
-- Built CONCURRENTLY: agent_messages is written continuously by live chat, so
-- a plain DROP/CREATE INDEX would take an ACCESS EXCLUSIVE lock for the whole
-- rebuild and stall live writes. CONCURRENTLY keeps reads/writes running.
--
-- CONCURRENTLY must run OUTSIDE a transaction block. Prisma only skips
-- wrapping a migration in a transaction when the file contains just bare
-- CONCURRENTLY statements — so this file carries ONLY bare CONCURRENTLY
-- index statements, no DML, matching the precedent
-- 20260807150000_add_hot_path_indexes.
--
-- `IF EXISTS` / `IF NOT EXISTS` make both statements no-ops if already applied
-- (or not yet created). If the CREATE build fails it leaves an INVALID index
-- of the same name — DROP it and re-deploy; do not blindly re-run.

DROP INDEX CONCURRENTLY IF EXISTS "agent_messages_organizationId_threadId_isDeleted_createdAt_id_idx";

CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_messages_organizationId_threadId_isDeleted_createdAt_id_idx"
  ON "agent_messages" ("organizationId", "threadId", "isDeleted", "createdAt" DESC, "id" DESC);
