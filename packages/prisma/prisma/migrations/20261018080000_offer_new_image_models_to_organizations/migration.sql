-- Organization model allowlists are seeded once and never merged, so
-- organizations created before FLUX.3, Ideogram 4.5 and the FLUX.2 klein sketch
-- model shipped could not see or use them. Offer these four keys once to every
-- organization that keeps an explicit allowlist. Models published after this
-- are offered by the reference-data sync on the run that creates their row.
-- Empty allowlists are skipped: they are re-seeded with the current defaults.
UPDATE "organization_settings" AS s
SET "enabledModelIds" = s."enabledModelIds" || ARRAY(
      SELECT k
      FROM unnest(ARRAY[
        'black-forest-labs/flux-3-image',
        'black-forest-labs/flux-3-image-edit',
        'ideogram-ai/ideogram-4-5',
        'black-forest-labs/flux-2-klein-4b'
      ]::text[]) AS k
      WHERE k <> ALL(s."enabledModelIds")
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE cardinality(s."enabledModelIds") > 0
  AND EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'black-forest-labs/flux-3-image',
      'black-forest-labs/flux-3-image-edit',
      'ideogram-ai/ideogram-4-5',
      'black-forest-labs/flux-2-klein-4b'
    ]::text[]) AS k
    WHERE k <> ALL(s."enabledModelIds")
  );
