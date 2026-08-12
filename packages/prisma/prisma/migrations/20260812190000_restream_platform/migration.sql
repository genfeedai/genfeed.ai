-- Restream as first-class credential + integration platform (OAuth + chat).

ALTER TYPE "CredentialPlatform" ADD VALUE IF NOT EXISTS 'RESTREAM';
ALTER TYPE "IntegrationPlatform" ADD VALUE IF NOT EXISTS 'RESTREAM';
