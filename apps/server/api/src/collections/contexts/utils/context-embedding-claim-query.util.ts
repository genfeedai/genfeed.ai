import { Prisma } from '@genfeedai/prisma';

export const EMBEDDING_REBUILD_BATCH_LIMIT = 50;
export const EMBEDDING_CLAIM_TTL_MINUTES = 5;

/**
 * Durable claim for the retrieval hot-path backfill (#2457).
 *
 * Concurrent retrievals must not all call the embedding provider for the same
 * pending rows. `FOR UPDATE SKIP LOCKED` plus `embeddingClaimedAt` lets one
 * request own a bounded batch; crashed claims expire after
 * EMBEDDING_CLAIM_TTL_MINUTES so another request can retry.
 *
 * Empty / whitespace-only content is excluded here and marked failed by
 * `buildEmptyContentFailQuery` so it never re-enters the sweep.
 */
export function buildPendingEmbeddingClaimQuery(
  organizationId: string,
  contextBaseIds: string[],
  limit: number = EMBEDDING_REBUILD_BATCH_LIMIT,
  ttlMinutes: number = EMBEDDING_CLAIM_TTL_MINUTES,
): ReturnType<typeof Prisma.sql> {
  if (contextBaseIds.length === 0) {
    throw new Error(
      'At least one context base is required for embedding claim',
    );
  }

  return Prisma.sql`
    WITH claimed AS (
      SELECT "id"
      FROM "context_entries"
      WHERE "organizationId" = ${organizationId}
        AND "isDeleted" = false
        AND "contextBaseId" IN (${Prisma.join(contextBaseIds)})
        AND "embedding" IS NULL
        AND "embeddingFailedAt" IS NULL
        AND (
          "embeddingClaimedAt" IS NULL
          OR "embeddingClaimedAt" < NOW() - (${ttlMinutes} * INTERVAL '1 minute')
        )
        AND NULLIF(BTRIM("data"->>'content'), '') IS NOT NULL
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "context_entries" AS entry
    SET "embeddingClaimedAt" = NOW()
    FROM claimed
    WHERE entry."id" = claimed."id"
      AND entry."organizationId" = ${organizationId}
      AND entry."isDeleted" = false
    RETURNING entry."id", entry."data"->>'content' AS "content"
  `;
}

export function buildEmptyContentFailQuery(
  organizationId: string,
  contextBaseIds: string[],
): ReturnType<typeof Prisma.sql> {
  if (contextBaseIds.length === 0) {
    throw new Error(
      'At least one context base is required to fail empty embeddings',
    );
  }

  return Prisma.sql`
    UPDATE "context_entries"
    SET "embeddingFailedAt" = NOW()
    WHERE "organizationId" = ${organizationId}
      AND "isDeleted" = false
      AND "contextBaseId" IN (${Prisma.join(contextBaseIds)})
      AND "embedding" IS NULL
      AND "embeddingFailedAt" IS NULL
      AND NULLIF(BTRIM("data"->>'content'), '') IS NULL
  `;
}

export function buildEmbeddingFailureQuery(
  entryId: string,
  organizationId: string,
): ReturnType<typeof Prisma.sql> {
  return Prisma.sql`
    UPDATE "context_entries"
    SET "embeddingFailedAt" = NOW(),
        "embeddingClaimedAt" = NULL
    WHERE "id" = ${entryId}
      AND "organizationId" = ${organizationId}
      AND "isDeleted" = false
  `;
}
