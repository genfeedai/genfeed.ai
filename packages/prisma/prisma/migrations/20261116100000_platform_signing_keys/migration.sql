-- Signing key for the OAuth client the platform runs against Bluesky (#10293).
-- Additive: a new table, no existing row changes.
CREATE TABLE "platform_signing_keys" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "publicJwk" JSONB NOT NULL,
    "privateJwk" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_signing_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_signing_keys_provider_key" ON "platform_signing_keys"("provider");
