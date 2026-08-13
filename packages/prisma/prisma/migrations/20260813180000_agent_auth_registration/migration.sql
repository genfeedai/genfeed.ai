-- Persist short-lived Auth.md verified-email claim ceremonies. Only token
-- hashes are stored; raw claim material is returned once to the agent/user.
CREATE TABLE "agent_auth_registrations" (
  "id" TEXT NOT NULL,
  "claimTokenHash" TEXT NOT NULL,
  "claimAttemptTokenHash" TEXT NOT NULL,
  "userCodeHash" TEXT NOT NULL,
  "emailHash" TEXT NOT NULL,
  "requestedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "userId" TEXT,
  "organizationId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "exchangedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_auth_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_auth_registrations_claimTokenHash_key"
  ON "agent_auth_registrations"("claimTokenHash");

CREATE UNIQUE INDEX "agent_auth_registrations_claimAttemptTokenHash_key"
  ON "agent_auth_registrations"("claimAttemptTokenHash");

CREATE INDEX "agent_auth_registrations_expiresAt_idx"
  ON "agent_auth_registrations"("expiresAt");

CREATE INDEX "agent_auth_registrations_emailHash_claimedAt_idx"
  ON "agent_auth_registrations"("emailHash", "claimedAt");

CREATE INDEX "agent_auth_registrations_userId_organizationId_idx"
  ON "agent_auth_registrations"("userId", "organizationId");
