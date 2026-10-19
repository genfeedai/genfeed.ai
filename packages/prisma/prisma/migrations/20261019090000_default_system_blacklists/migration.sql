-- Platform default blacklists ("system blacklists").
--
-- `20261004100000_default_studio_elements` (#6038) made every other Studio
-- element platform-capable but left `elements_blacklists` organization-only, so
-- nothing a new organization could pick ("no text", "no watermark", ...)
-- existed unless an admin typed it into every organization by hand.
--
-- Ownership
-- ---------
-- Same model as the other elements: a row with `organizationId IS NULL` is a
-- platform default, readable by every organization and writable only by
-- superadmins. A row with an organization is owned by it.
--
-- Columns
-- -------
--   isActive   superadmins deactivate a default instead of deleting it
--   isDefault  pre-selected in the prompt bar (the admin "Default" checkbox,
--              which the serializer, DTO and prompt bar already read)
--   sortOrder  curated order of the defaults (lowest first)
-- All three have constant defaults, so adding them is metadata-only.
--
-- Seed
-- ----
-- Inserted only when no row has the deterministic id and no platform row has
-- the same key, soft-deleted rows included, so re-running inserts nothing, a
-- renamed default is not re-inserted, and a superadmin edit, deactivation or
-- deletion is never overwritten or resurrected. None is
-- pre-selected: the user chooses what to avoid. The key is what the generation
-- request carries as the negative-prompt term, so keys read as the thing to
-- avoid. Ids are deterministic (`c` + 24 hex of md5 over table and key).

ALTER TABLE "elements_blacklists"
  ALTER COLUMN "organizationId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "elements_blacklists_scope_idx" ON "elements_blacklists"("organizationId", "isDeleted", "isActive", "sortOrder");

-- elements_blacklists
INSERT INTO "elements_blacklists" ("id", "organizationId", "key", "label", "description", "category", "isDeleted", "isActive", "isDefault", "sortOrder", "createdAt", "updatedAt")
SELECT 'c' || substr(md5('elements_blacklists:' || seed."key"), 1, 24), NULL, seed."key", seed."label", seed."description", seed."category", false, true, false, seed."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('text', 'No text', 'No captions, lettering or typography in the image.', 'image', 0),
  ('watermark', 'No watermark', 'No watermarks or stock-photo overlays.', 'image', 10),
  ('logo', 'No logos', 'No brand marks or logos.', 'image', 20),
  ('blurry', 'No blur', 'No out-of-focus or smeared detail.', 'image', 30),
  ('low-quality', 'No low quality', 'No low-resolution, noisy or pixelated results.', 'image', 40),
  ('distorted-hands', 'No distorted hands', 'No malformed fingers or hands.', 'image', 50),
  ('extra-limbs', 'No extra limbs', 'No duplicated or missing limbs and body parts.', 'image', 60),
  ('cropped', 'No cropping', 'No subjects cut off at the frame edge.', 'image', 70),
  ('jpeg-artifacts', 'No compression artifacts', 'No blocky artifacts or banding.', 'image', 80),
  ('subtitles', 'No subtitles', 'No burned-in captions or on-screen text.', 'video', 0),
  ('watermarks', 'No watermark', 'No watermarks or logo overlays.', 'video', 10),
  ('flickering', 'No flicker', 'No frame-to-frame flicker or strobing.', 'video', 20),
  ('jittery-motion', 'No jitter', 'No shaky or stuttering motion.', 'video', 30),
  ('morphing', 'No morphing', 'No subjects melting or changing shape between frames.', 'video', 40),
  ('camera-shake', 'No camera shake', 'No handheld wobble unless asked for.', 'video', 50),
  ('motion-blur', 'No motion blur', 'No smeared detail on fast movement.', 'video', 60)
) AS seed("key", "label", "description", "category", "sortOrder")
WHERE NOT EXISTS (
  SELECT 1 FROM "elements_blacklists" existing
  WHERE existing."id" = 'c' || substr(md5('elements_blacklists:' || seed."key"), 1, 24)
    OR (existing."organizationId" IS NULL AND existing."key" = seed."key")
);
