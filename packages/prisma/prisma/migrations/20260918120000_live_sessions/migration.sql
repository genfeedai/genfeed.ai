-- Director live sessions reserve credits against a declared ceiling (#4611).

CREATE TYPE "LiveSessionStatus" AS ENUM (
  'OPEN',
  'TERMINATED'
);

CREATE TABLE "live_sessions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT,
  "userId" TEXT NOT NULL,
  "modelKey" TEXT NOT NULL,
  "resolution" TEXT,
  "ceilingSeconds" INTEGER NOT NULL,
  "reservedCredits" DOUBLE PRECISION NOT NULL,
  "reservationId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ceilingEndsAt" TIMESTAMP(3) NOT NULL,
  "terminatedAt" TIMESTAMP(3),
  "elapsedSeconds" INTEGER,
  "settledCredits" DOUBLE PRECISION,
  "terminateReason" TEXT,
  "status" "LiveSessionStatus" NOT NULL DEFAULT 'OPEN',
  "isByokBypass" BOOLEAN NOT NULL DEFAULT false,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "live_sessions_organizationId_isDeleted_status_idx" ON "live_sessions"("organizationId", "isDeleted", "status");
CREATE INDEX "live_sessions_organizationId_reservationId_isDeleted_idx" ON "live_sessions"("organizationId", "reservationId", "isDeleted");
CREATE INDEX "live_sessions_status_ceilingEndsAt_idx" ON "live_sessions"("status", "ceilingEndsAt");

ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
