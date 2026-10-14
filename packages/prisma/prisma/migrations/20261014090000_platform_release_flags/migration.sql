-- Releases move from the hardcoded founder-only list to Admin → Flags.
--
-- A release item without a stored `release_<id>` flag is preview-only, so the
-- modules released to every cloud organization today are stored as released.
-- Motion, Clips, Editor, Automation, Messages, Campaigns and the experimental
-- Analytics pages stay preview-only until an operator releases them.
-- Playground and Storyboard are always released and have no flag.

UPDATE "platform_settings"
SET "flags" = COALESCE("flags", '{}'::jsonb) || '{
  "release_publishing": true,
  "release_analytics": true,
  "release_turbo": true,
  "release_discovery": true
}'::jsonb
WHERE "key" = 'platform';
