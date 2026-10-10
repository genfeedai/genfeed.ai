CREATE UNIQUE INDEX "posts_id_exposure_scope_key" ON "posts" ("id", "organizationId", "brandId");
CREATE UNIQUE INDEX "credentials_id_exposure_scope_key" ON "credentials" ("id", "organizationId", "brandId");

CREATE TABLE "post_exposure_observations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "logicalPostId" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "contentDigest" TEXT NOT NULL,
  "publicationFingerprint" TEXT NOT NULL,
  "sourceAttemptId" TEXT NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "requestStartedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "providerAsOf" TIMESTAMP(3),
  "exposures" JSONB NOT NULL,
  "isPinned" BOOLEAN,
  "isPromoted" BOOLEAN,
  "isResponse" BOOLEAN NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "post_exposure_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "post_exposure_observations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "post_exposure_observations_brand_scope_fkey" FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "post_exposure_observations_credential_scope_fkey" FOREIGN KEY ("credentialId", "organizationId", "brandId") REFERENCES "credentials"("id", "organizationId", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "post_exposure_observations_post_scope_fkey" FOREIGN KEY ("postId", "organizationId", "brandId") REFERENCES "posts"("id", "organizationId", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "post_exposure_observations_collection_check" CHECK (
    "requestStartedAt" >= "publishedAt" AND "receivedAt" >= "requestStartedAt"
    AND "receivedAt" - "requestStartedAt" <= INTERVAL '5 minutes'
    AND ("providerAsOf" IS NULL OR ("providerAsOf" >= "publishedAt" AND "providerAsOf" <= "receivedAt"))
  )
);
CREATE UNIQUE INDEX "post_exposure_observations_id_organizationId_key" ON "post_exposure_observations"("id", "organizationId");
CREATE UNIQUE INDEX "post_exposure_observations_attempt_key" ON "post_exposure_observations"("organizationId", "credentialId", "platform", "externalId", "sourceAttemptId");
CREATE INDEX "post_exposure_observations_baseline_idx" ON "post_exposure_observations"("organizationId", "brandId", "credentialId", "platform", "format", "isDeleted", "publishedAt" DESC);
CREATE INDEX "post_exposure_observations_post_idx" ON "post_exposure_observations"("organizationId", "postId", "isDeleted", "receivedAt" DESC);
