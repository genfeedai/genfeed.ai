-- Storyboard, Turbo, Motion, Clips and Editor are apps with their own
-- platform switch, no longer surfaces nested under Studio. Each stored switch
-- keeps its value under the new key, so no app changes state on deploy.

UPDATE "platform_settings"
SET "flags" = ("flags" - 'studio_storyboard')
  || jsonb_build_object('storyboard', "flags" -> 'studio_storyboard')
WHERE jsonb_typeof("flags") = 'object' AND "flags" ? 'studio_storyboard';

UPDATE "platform_settings"
SET "flags" = ("flags" - 'studio_turbo')
  || jsonb_build_object('turbo', "flags" -> 'studio_turbo')
WHERE jsonb_typeof("flags") = 'object' AND "flags" ? 'studio_turbo';

UPDATE "platform_settings"
SET "flags" = ("flags" - 'studio_motion')
  || jsonb_build_object('motion', "flags" -> 'studio_motion')
WHERE jsonb_typeof("flags") = 'object' AND "flags" ? 'studio_motion';

UPDATE "platform_settings"
SET "flags" = ("flags" - 'studio_clips')
  || jsonb_build_object('clips', "flags" -> 'studio_clips')
WHERE jsonb_typeof("flags") = 'object' AND "flags" ? 'studio_clips';

UPDATE "platform_settings"
SET "flags" = ("flags" - 'studio_editor')
  || jsonb_build_object('editor', "flags" -> 'studio_editor')
WHERE jsonb_typeof("flags") = 'object' AND "flags" ? 'studio_editor';
