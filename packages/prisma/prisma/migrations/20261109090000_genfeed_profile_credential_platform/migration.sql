-- The creator profile at genfeed.ai/@handle is a built-in publishing channel
-- (#9664). Its own migration: Postgres cannot use a new enum label in the
-- transaction that adds it.
ALTER TYPE "CredentialPlatform" ADD VALUE IF NOT EXISTS 'GENFEED';
