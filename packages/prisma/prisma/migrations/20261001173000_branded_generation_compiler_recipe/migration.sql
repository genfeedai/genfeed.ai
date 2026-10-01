BEGIN;
ALTER TABLE "generation_prompt_snapshots" DROP CONSTRAINT "generation_prompt_snapshots_branded_link_check";
ALTER TABLE "generation_prompt_snapshots" ADD CONSTRAINT "generation_prompt_snapshots_branded_link_check" CHECK (
 ("format" = 'genfeed.branded-generation-prompt.v1' AND "contentHash" ~ '^sha256:[0-9a-f]{64}$' AND "brandedGenerationReceiptId" IS NOT NULL AND "brandedGenerationReceiptRevision" IS NOT NULL AND "brandedGenerationReceiptRevision" >= 0 AND "brandId" IS NOT NULL AND "brandedGenerationReceiptStage" IS NOT NULL AND "brandedGenerationReceiptStage" IN ('original','enhanced','compiled')) OR
 ("format" = 'genfeed.branded-generation-compiled.v1' AND "contentHash" ~ '^sha256:[0-9a-f]{64}$' AND "brandedGenerationReceiptId" IS NOT NULL AND "brandedGenerationReceiptRevision" IS NOT NULL AND "brandedGenerationReceiptRevision" >= 0 AND "brandId" IS NOT NULL AND "brandedGenerationReceiptStage" IS NOT NULL AND "brandedGenerationReceiptStage" = 'compiled') OR
 ("format" NOT IN ('genfeed.branded-generation-prompt.v1','genfeed.branded-generation-compiled.v1') AND "brandedGenerationReceiptId" IS NULL AND "brandedGenerationReceiptRevision" IS NULL AND "brandedGenerationReceiptStage" IS NULL)
);
ALTER TABLE "generation_prompt_snapshots" DROP CONSTRAINT "generation_prompt_snapshots_ciphertext_check";
ALTER TABLE "generation_prompt_snapshots" ADD CONSTRAINT "generation_prompt_snapshots_ciphertext_check" CHECK (
 ("format" NOT IN ('genfeed.branded-generation-prompt.v1','genfeed.branded-generation-compiled.v1') AND (
        "ciphertext" ~ '^[0-9a-fA-F]{32}:[0-9a-fA-F]+:[0-9a-fA-F]{32}$'
        AND "retentionState" IN ('retained', 'purged')
 )) OR ("format" = 'genfeed.branded-generation-prompt.v1' AND (
 ("retentionState" = 'retained' AND "ciphertext" ~ '^[0-9a-fA-F]{32}:[0-9a-fA-F]+:[0-9a-fA-F]{32}$') OR
 ("retentionState" = 'purged' AND "ciphertext" = '' AND "isDeleted" = true)
 )) OR ("format" = 'genfeed.branded-generation-compiled.v1' AND "retentionState" IS NOT NULL AND "ciphertext" IS NOT NULL AND (
 ("retentionState" = 'retained' AND "ciphertext" ~ '^[0-9a-fA-F]{32}:([0-9a-fA-F]{2})+:[0-9a-fA-F]{32}$' AND char_length("ciphertext") <= 8388674) OR
 ("retentionState" = 'purged' AND "ciphertext" = '' AND "isDeleted" = true)
 ))
);
COMMIT;
