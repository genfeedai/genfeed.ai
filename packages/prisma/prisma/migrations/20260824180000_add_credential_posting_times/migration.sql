-- Preferred posting times per connected account (#3256).
-- Clock times are stored as JSON [{ "hour": 9, "minute": 0 }, ...] and
-- resolved in the brand timezone by day-view rows and find-next-slot.

ALTER TABLE "credentials"
ADD COLUMN "postingTimes" JSONB NOT NULL DEFAULT '[]';
