-- The agent chat model is now platform-pinned (one free OpenRouter model,
-- admin-managed via the models registry `isDefault`). There is no
-- user-facing chat-model choice anymore, and the server no longer reads a
-- per-user override, so the stored preference has no live reader or writer.
ALTER TABLE "settings" DROP COLUMN IF EXISTS "defaultAgentModel";
