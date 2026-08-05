-- Draft and review posts can exist before a publishing account is selected.
-- PostsService still requires both fields before scheduling or publishing.
ALTER TABLE "posts"
  ALTER COLUMN "credentialId" DROP NOT NULL,
  ALTER COLUMN "platform" DROP NOT NULL;
