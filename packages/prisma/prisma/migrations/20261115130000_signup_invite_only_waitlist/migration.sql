-- Invite-only signup switch and the public waitlist.
-- The switch defaults to off so a fresh or self-hosted install can create its
-- first account; the hosted deployment turns it on from the admin settings.
ALTER TABLE "platform_settings"
  ADD COLUMN "isSignupInviteOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "waitlist_entries" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "website" TEXT,
  "useCase" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "referrerDomain" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "waitlist_entries_email_key" ON "waitlist_entries"("email");

CREATE INDEX "waitlist_entries_status_created_idx"
  ON "waitlist_entries"("status", "isDeleted", "createdAt" DESC);
