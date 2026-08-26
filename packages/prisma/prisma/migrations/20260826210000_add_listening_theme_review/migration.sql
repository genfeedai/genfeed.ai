-- Durable operator review state for social intelligence themes (#1797).

ALTER TABLE "listening_themes"
  ADD COLUMN "reviewState" TEXT NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedBy" TEXT;

ALTER TABLE "listening_themes"
  ADD CONSTRAINT "listening_themes_review_state_check"
  CHECK ("reviewState" IN ('unreviewed', 'acknowledged', 'deferred'));

ALTER TABLE "listening_themes"
  ADD CONSTRAINT "listening_themes_review_audit_check"
  CHECK (
    ("reviewState" = 'unreviewed' AND "reviewedAt" IS NULL AND "reviewedBy" IS NULL)
    OR
    ("reviewState" IN ('acknowledged', 'deferred') AND "reviewedAt" IS NOT NULL AND "reviewedBy" IS NOT NULL)
  );

ALTER TABLE "listening_themes"
  ADD CONSTRAINT "listening_themes_reviewed_by_fkey"
  FOREIGN KEY ("reviewedBy") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
