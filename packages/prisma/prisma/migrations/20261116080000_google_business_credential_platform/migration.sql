-- A Google Business Profile location is a publishing channel (#10297). Its own
-- migration: Postgres cannot use a new enum label in the transaction that adds it.
ALTER TYPE "CredentialPlatform" ADD VALUE IF NOT EXISTS 'GOOGLE_BUSINESS';
