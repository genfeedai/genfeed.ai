-- Credential reference for workflow provider continuations.
--
-- A continuation submitted with the organization's own provider key (BYOK)
-- must be polled with that key: the platform key cannot read a job that lives
-- in the customer's provider account. Existing rows default to false, the
-- platform key they were polled with before.
ALTER TABLE "workflow_node_continuations"
  ADD COLUMN "isByok" BOOLEAN NOT NULL DEFAULT false;
