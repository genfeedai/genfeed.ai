/*
  Newsletter schema reconciliation (data-preserving, hand-edited).

  The newsletters table kept its Mongo-era shape (title/scheduledAt/sentAt +
  NewsletterStatus enum) while the application was rebuilt around
  label/topic/angle/summary/sourceRefs and the lowercase lifecycle statuses in
  newsletter.constants.ts (proposed|draft|ready_for_review|approved|published|
  archived). Every NewslettersService write threw PrismaClientValidationError
  in production. Same approach as 20260609150437_reconcile_prod_schema:
  ALTER ... TYPE TEXT USING lower(...) to preserve rows, then remap the legacy
  enum values onto application statuses.
*/

-- Rename Mongo-era columns to the names the application addresses
ALTER TABLE "newsletters" RENAME COLUMN "title" TO "label";
ALTER TABLE "newsletters" RENAME COLUMN "scheduledAt" TO "scheduledFor";

-- Columns the application writes that never existed on the Prisma model
ALTER TABLE "newsletters" ADD COLUMN     "topic" TEXT,
ADD COLUMN     "angle" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "generationPrompt" TEXT,
ADD COLUMN     "sourceRefs" JSONB,
ADD COLUMN     "contextNewsletterIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- NewsletterStatus enum -> TEXT (data-preserving)
ALTER TABLE "newsletters" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "newsletters" ALTER COLUMN "status" TYPE TEXT USING lower("status"::text);
ALTER TABLE "newsletters" ALTER COLUMN "status" SET DEFAULT 'draft';
ALTER TABLE "newsletters" ALTER COLUMN "status" SET NOT NULL;

-- Remap legacy enum members onto application statuses: sent rows are
-- published issues (preserving the send time), scheduled rows were approved
-- and queued, failed sends return to draft for editing.
UPDATE "newsletters" SET "publishedAt" = "sentAt" WHERE "status" = 'sent' AND "sentAt" IS NOT NULL;
UPDATE "newsletters" SET "status" = 'published' WHERE "status" = 'sent';
UPDATE "newsletters" SET "status" = 'approved' WHERE "status" = 'scheduled';
UPDATE "newsletters" SET "status" = 'draft' WHERE "status" = 'failed';

-- sentAt is fully superseded by publishedAt
ALTER TABLE "newsletters" DROP COLUMN "sentAt";

-- No column references the enum type anymore
DROP TYPE "NewsletterStatus";
