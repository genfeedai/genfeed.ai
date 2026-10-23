ALTER TABLE "models" ADD COLUMN "isProviderVariant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "models" ADD COLUMN "pinnedProvider" TEXT;
CREATE TABLE "model_provider_offers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "modelId" TEXT NOT NULL REFERENCES "models"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "executionModelId" TEXT NOT NULL REFERENCES "models"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "model_provider_offers_modelId_executionModelId_key" ON "model_provider_offers"("modelId", "executionModelId");
CREATE INDEX "model_provider_offers_executionModelId_idx" ON "model_provider_offers"("executionModelId");
CREATE TABLE "provider_routing_settings" (
  "provider" TEXT NOT NULL PRIMARY KEY,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "model_provider_offers_execution_owner_key" ON "model_provider_offers"("executionModelId") WHERE "modelId" <> "executionModelId";
