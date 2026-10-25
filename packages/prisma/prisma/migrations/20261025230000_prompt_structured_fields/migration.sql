-- Structured prompt slots on prompts: the editable record of a prompt (subject,
-- action, camera movement, lens, lighting next to the existing style, mood, camera,
-- scene, sounds, speech and blacklists), plus the prose rendered for the model from
-- them and the render target. All nullable: existing rows keep their free text.
ALTER TABLE "prompts"
  ADD COLUMN "subject" TEXT,
  ADD COLUMN "action" TEXT,
  ADD COLUMN "cameraMovement" TEXT,
  ADD COLUMN "lens" TEXT,
  ADD COLUMN "lighting" TEXT,
  ADD COLUMN "renderedPrompt" TEXT,
  ADD COLUMN "renderTarget" TEXT;
