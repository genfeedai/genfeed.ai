-- Link a perception record to its vision evaluation (#4881). Nullable and
-- additive: the media-gates sweep evaluates rows that have no link yet.
ALTER TABLE "media_perceptions" ADD COLUMN "visionEvaluationId" TEXT;
