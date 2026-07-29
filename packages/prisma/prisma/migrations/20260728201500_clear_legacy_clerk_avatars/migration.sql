-- Better Auth maps its session `image` field to users.avatar. Users migrated
-- from Clerk can still carry Clerk proxy URLs in that column even though Clerk
-- is no longer an authentication or image-hosting dependency.
--
-- Clear only Clerk-owned hosts. The UI falls back to the user's initial, and a
-- subsequent linked-provider profile update can populate a current avatar.
UPDATE "users"
SET "avatar" = NULL
-- Hostname labels only ([a-z0-9_-]), never path segments — prevents false
-- positives like https://cdn.example.com/images.clerk.com/avatar.png
WHERE "avatar" ~* '^https?://([a-z0-9_-]+\.)*clerk\.(com|dev)(/|$)';
