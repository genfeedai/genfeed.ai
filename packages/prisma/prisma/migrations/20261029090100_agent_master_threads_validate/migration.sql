-- Validates the constraints 20261029090000_agent_master_threads added NOT
-- VALID (#8526). Kept in its own migration (its own transaction) so the scan
-- does not extend the lock taken by the DDL there. Both constraints already
-- hold for every existing row: every row carries the 'thread' kind default, and
-- the earlier UPDATE cleared each parentThreadId that did not name a thread of
-- the same organization.
ALTER TABLE "agent_threads" VALIDATE CONSTRAINT "agent_threads_kind_check";
ALTER TABLE "agent_threads" VALIDATE CONSTRAINT "agent_threads_parentThreadId_organizationId_fkey";
