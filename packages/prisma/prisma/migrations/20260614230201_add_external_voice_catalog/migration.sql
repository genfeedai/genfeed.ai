-- CreateTable
CREATE TABLE "external_voices" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalProvider" "VoiceProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "sampleAudioUrl" TEXT,
    "language" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefaultSelectable" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "providerData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_voices_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN "externalVoiceCatalogId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "external_voices_provider_external_id_key" ON "external_voices"("externalProvider", "externalId");

-- CreateIndex
CREATE INDEX "external_voices_provider_active_selectable_idx" ON "external_voices"("externalProvider", "isActive", "isDefaultSelectable");

-- CreateIndex
CREATE INDEX "ingredients_externalVoiceCatalogId_idx" ON "ingredients"("externalVoiceCatalogId");

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_externalVoiceCatalogId_fkey" FOREIGN KEY ("externalVoiceCatalogId") REFERENCES "external_voices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
