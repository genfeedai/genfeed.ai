-- Stitch options for a merge-enabled interpolation batch (#5460).
--
-- The batch writes the transition, caption and music settings onto each clip
-- when it starts; the webhook auto-merge stitches the group with them. Existing
-- rows stay NULL, which the stitch service reads as a plain cut.
ALTER TABLE "ingredients" ADD COLUMN "mergeSettings" JSONB;

-- One active stitch output per organization and idempotency key. The insert
-- is the atomic claim: a concurrent request with the same key collides here
-- and returns the existing output instead of queuing a second job. The
-- predicate only matches stitch outputs (generationSource 'video-stitch:*'),
-- which this release introduces, so no existing row can violate it. Other
-- sourceActionId producers (image retries) legitimately repeat keys and stay
-- unconstrained.
CREATE UNIQUE INDEX "ingredients_org_stitch_source_action_uidx"
  ON "ingredients"("organizationId", "sourceActionId")
  WHERE "isDeleted" = false
    AND "sourceActionId" IS NOT NULL
    AND "generationSource" LIKE 'video-stitch:%';
