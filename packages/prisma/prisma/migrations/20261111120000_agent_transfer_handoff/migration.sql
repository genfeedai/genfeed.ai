-- Hand a task to a teammate's agent (#9940, part of #8606).
--
-- A transfer only ever moved work between two threads of the same user. A
-- hand-off names a destination thread that belongs to another member of the
-- organization, so it needs an owner for that thread and a state for the
-- request the teammate has not answered yet.
--
-- Additive only: the new column is nullable, the two enum values are new, and
-- no existing row changes. AWAITING_ACCEPTANCE is the request before the
-- teammate answers; DECLINED is the answer no.
ALTER TYPE "AgentTransferStatus" ADD VALUE IF NOT EXISTS 'AWAITING_ACCEPTANCE';
ALTER TYPE "AgentTransferStatus" ADD VALUE IF NOT EXISTS 'DECLINED';

ALTER TABLE "agent_transfers" ADD COLUMN "destinationUserId" TEXT;

CREATE INDEX "agent_transfers_destination_user_idx"
  ON "agent_transfers"("organizationId", "destinationUserId", "destinationThreadId", "isDeleted", "createdAt" DESC);

-- The destination member is part of a transfer's identity: once a request names
-- a teammate it can never be pointed at another one.
CREATE OR REPLACE FUNCTION prevent_agent_transfer_identity_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'agent transfer records are immutable';
  END IF;

  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."destinationUserId" IS DISTINCT FROM OLD."destinationUserId"
    OR NEW."sourceBrandId" IS DISTINCT FROM OLD."sourceBrandId"
    OR NEW."destinationBrandId" IS DISTINCT FROM OLD."destinationBrandId"
    OR NEW."sourceThreadId" IS DISTINCT FROM OLD."sourceThreadId"
    OR NEW."destinationThreadId" IS DISTINCT FROM OLD."destinationThreadId"
    OR NEW."sourceMessageId" IS DISTINCT FROM OLD."sourceMessageId"
    OR NEW."destinationMessageId" IS DISTINCT FROM OLD."destinationMessageId"
    OR NEW."deliveryMode" IS DISTINCT FROM OLD."deliveryMode"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
    OR NEW."correlationId" IS DISTINCT FROM OLD."correlationId"
    OR NEW."parentCorrelationId" IS DISTINCT FROM OLD."parentCorrelationId"
    OR NEW."depth" IS DISTINCT FROM OLD."depth"
    OR NEW."content" IS DISTINCT FROM OLD."content"
    OR NEW."selectedContext" IS DISTINCT FROM OLD."selectedContext"
    OR NEW."artifactReferences" IS DISTINCT FROM OLD."artifactReferences"
    OR NEW."artifactVersionPinIds" IS DISTINCT FROM OLD."artifactVersionPinIds"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'agent transfer identity and payload are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
