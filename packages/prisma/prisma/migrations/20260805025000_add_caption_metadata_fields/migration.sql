ALTER TABLE "captions"
ADD COLUMN "format" TEXT NOT NULL DEFAULT 'srt',
ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';

CREATE INDEX "captions_organizationId_userId_isDeleted_createdAt_idx"
ON "captions"("organizationId", "userId", "isDeleted", "createdAt" DESC);
