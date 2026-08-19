-- Calendar cadence plans and slot reservations (#3247 / #3250).
-- Cadence is a product view; it does not dispatch work.

-- CreateTable
CREATE TABLE "posting_cadences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "label" TEXT,
    "format" TEXT NOT NULL,
    "intervalMinutes" INTEGER NOT NULL,
    "windowStartMinute" INTEGER NOT NULL,
    "windowEndMinute" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "maxOccurrences" INTEGER,
    "generateLanding" TEXT NOT NULL DEFAULT 'draft',
    "brief" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posting_cadences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_reservations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "cadenceId" TEXT,
    "credentialId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "instant" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "identityKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'missing',
    "generatedItemId" TEXT,
    "generatedItemType" TEXT,
    "lastFailureReason" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slot_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posting_cadences_org_brand_status_idx" ON "posting_cadences"("organizationId", "isDeleted", "brandId", "status");

-- CreateIndex
CREATE INDEX "posting_cadences_org_created_idx" ON "posting_cadences"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "slot_reservations_org_identity_key" ON "slot_reservations"("organizationId", "identityKey");

-- CreateIndex
CREATE INDEX "slot_reservations_org_brand_instant_idx" ON "slot_reservations"("organizationId", "isDeleted", "brandId", "instant");

-- AddForeignKey
ALTER TABLE "posting_cadences" ADD CONSTRAINT "posting_cadences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posting_cadences" ADD CONSTRAINT "posting_cadences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posting_cadences" ADD CONSTRAINT "posting_cadences_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posting_cadences" ADD CONSTRAINT "posting_cadences_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_reservations" ADD CONSTRAINT "slot_reservations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_reservations" ADD CONSTRAINT "slot_reservations_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_reservations" ADD CONSTRAINT "slot_reservations_cadenceId_fkey" FOREIGN KEY ("cadenceId") REFERENCES "posting_cadences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_reservations" ADD CONSTRAINT "slot_reservations_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
