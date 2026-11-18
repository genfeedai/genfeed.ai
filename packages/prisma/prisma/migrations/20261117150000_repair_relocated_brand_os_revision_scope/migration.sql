-- Only repair live revisions that predate a completed move between these exact
-- organizations. Print the repaired revision and relocation ids in the migration log.
DO $$
DECLARE repaired record;
BEGIN
  FOR repaired IN
    WITH proof AS (
      SELECT DISTINCT ON (r.id) r.id, m.id AS move_id, r."organizationId" AS destination,
             m."organizationId" AS source
      FROM brand_os_revisions r
      JOIN brands b ON b.id = r."brandId" AND b."organizationId" = r."organizationId"
      JOIN brand_relocations m ON m."brandId" = b.id
        AND m."destinationOrganizationId" = b."organizationId"
        AND m."organizationId" = r.content->>'organizationId'
      WHERE NOT r."isDeleted" AND NOT b."isDeleted" AND NOT m."isDeleted"
        AND m.status = 'done' AND r."createdAt" <= m."updatedAt"
        AND m."organizationId" <> r."organizationId"
        AND (r.content->>'brandId' IS NULL OR r.content->>'brandId' = r."brandId")
      ORDER BY r.id, m."updatedAt" DESC, m.id
    )
    UPDATE brand_os_revisions r
    SET content = jsonb_set(r.content, '{organizationId}', to_jsonb(proof.destination)),
        "updatedAt" = CURRENT_TIMESTAMP
    FROM proof WHERE r.id = proof.id AND r."organizationId" = proof.destination
      AND r.content->>'organizationId' = proof.source AND NOT r."isDeleted"
    RETURNING r.id, proof.move_id
  LOOP
    RAISE LOG 'Repaired Brand OS revision % from relocation %', repaired.id, repaired.move_id;
  END LOOP;
END $$;
