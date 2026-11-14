-- Lifetime-deal seats: a one-time purchase that gives an organization the Pro
-- plan and its monthly credits for good, capped at a fixed number of seats.
--
-- The unique seat number is the cap and the unique checkout session id makes a
-- replayed payment event a no-op. New, empty table: nothing to backfill and no
-- lock on an existing table beyond the foreign key's brief share lock on
-- "organizations".

CREATE TABLE "lifetime_deal_seats" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "monthlyCredits" INTEGER NOT NULL,
    "nextCreditGrantAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lifetime_deal_seats_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lifetime_deal_seats_seat_number_positive" CHECK ("seatNumber" >= 1),
    CONSTRAINT "lifetime_deal_seats_monthly_credits_positive" CHECK ("monthlyCredits" > 0)
);

CREATE UNIQUE INDEX "lifetime_deal_seats_organizationId_key" ON "lifetime_deal_seats"("organizationId");
CREATE UNIQUE INDEX "lifetime_deal_seats_seatNumber_key" ON "lifetime_deal_seats"("seatNumber");
CREATE UNIQUE INDEX "lifetime_deal_seats_stripeCheckoutSessionId_key" ON "lifetime_deal_seats"("stripeCheckoutSessionId");
CREATE INDEX "lifetime_deal_seats_nextCreditGrantAt_idx" ON "lifetime_deal_seats"("nextCreditGrantAt");

ALTER TABLE "lifetime_deal_seats" ADD CONSTRAINT "lifetime_deal_seats_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
