-- Add the missing hot-path indexes for three tenant tables that were doing
-- sequential scans (audit docs/audits/01-dry-slop-audit.md, org-index gap).
--
-- The audit framed this as an "organizationId index gap", but a per-model query
-- audit shows these three are NOT read by organizationId — their hot filters are
-- FK-leading. Indexing the real filter is the actual fix; a dead organizationId
-- index would only add write amplification:
--   * prompts        — list scoped by owning user: WHERE userId, isDeleted
--                      ORDER BY createdAt DESC (prompts.controller findAll).
--   * context_entries — read per context base: WHERE contextBaseId, isDeleted
--                      (contexts.service getStats / findSimilarEntries).
--   * votes          — toggled per (entity, user): WHERE entityId, userId,
--                      isDeleted (agent-tool-executor toggle + votes remove).
--
-- Built CONCURRENTLY: all three are continuously written (every generation,
-- context add, and vote), so a plain CREATE INDEX would take an ACCESS EXCLUSIVE
-- lock for the whole build and stall live writes. CONCURRENTLY keeps reads/writes
-- running.
--
-- CONCURRENTLY must run OUTSIDE a transaction block. Prisma runs a migration's
-- statements without a wrapping transaction ONLY when the file contains just
-- CONCURRENTLY index builds — so this file carries ONLY bare CONCURRENTLY builds,
-- no DML / DO $$ blocks, matching the precedent
-- 20260703120100_add_post_analytics_daily_unique. See prisma/prisma#14456.
--
-- `IF NOT EXISTS` makes each build a no-op where the index already exists. If a
-- build fails it leaves an INVALID index of the same name — DROP it and re-deploy;
-- do not blindly re-run.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "prompts_user_deleted_created_at_idx"
  ON "prompts" ("userId", "isDeleted", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "context_entries_context_base_deleted_idx"
  ON "context_entries" ("contextBaseId", "isDeleted");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "votes_entity_user_deleted_idx"
  ON "votes" ("entityId", "userId", "isDeleted");
