-- Studio image editing uses the same scoped autosaved draft as generation.
-- Expand the existing constraint without changing any saved draft fields.
ALTER TABLE "studio_generate_drafts"
  DROP CONSTRAINT "studio_generate_drafts_type_check",
  ADD CONSTRAINT "studio_generate_drafts_type_check"
    CHECK ("type" IN ('image', 'image-edit', 'video', 'music', 'avatar', 'voice'));
