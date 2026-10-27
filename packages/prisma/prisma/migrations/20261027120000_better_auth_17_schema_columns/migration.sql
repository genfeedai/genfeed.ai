-- Better Auth 1.7 validates the Prisma schema before serving auth requests and
-- rejects them (500 on sign-up) when a plugin column is missing. Add the three
-- it asks for: organization.metadata, and the signing algorithm and curve of a
-- JWKS key. All nullable and unused by existing rows, so this is additive and
-- safe to apply before the new API code runs.
ALTER TABLE "organizations" ADD COLUMN "metadata" TEXT;

ALTER TABLE "auth_jwks"
  ADD COLUMN "alg" TEXT,
  ADD COLUMN "crv" TEXT;
