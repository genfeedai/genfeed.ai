-- Stitch options for a merge-enabled interpolation batch (#5460).
--
-- The batch writes the transition, caption and music settings onto each clip
-- when it starts; the webhook auto-merge stitches the group with them. Existing
-- rows stay NULL, which the stitch service reads as a plain cut.
ALTER TABLE "ingredients" ADD COLUMN "mergeSettings" JSONB;
