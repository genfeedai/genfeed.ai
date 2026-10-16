-- openai/clip was the embedding model before BAAI BGE replaced it. It left the
-- model catalog and capability map, nothing dispatches it, and Replicate bills it
-- by GPU runtime with no public per-call rate, so the pricing panel showed it as
-- unpriceable. The catalog seed no longer owns the row, so only this removes it.
UPDATE "models"
SET "isDeleted" = true,
    "isActive" = false,
    "isDefault" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'openai/clip'
  AND "organizationId" IS NULL
  AND "isDeleted" = false;

-- FLUX.3 is a curated, priced, Recommended image model whose row was created
-- inactive on 2026-10-02. The catalog seed only activates a row on its first
-- curation (cost 0 to a price), and this row already carried its price, so it
-- never turned on. FLUX.3 Edit, the same Replicate model, is already active.
UPDATE "models"
SET "isActive" = true,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'black-forest-labs/flux-3-image'
  AND "organizationId" IS NULL
  AND "isDeleted" = false
  AND "isActive" = false;
