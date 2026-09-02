import { CONTEXT_EMBEDDING_DIMENSION } from '@genfeedai/constants';
import { Prisma } from '@genfeedai/prisma';

export function similarityToCosineDistance(minSimilarity: number): number {
  return 1 - minSimilarity;
}

export function serializeContextEmbedding(embedding: number[]): string {
  if (
    embedding.length !== CONTEXT_EMBEDDING_DIMENSION ||
    embedding.some((component) => !Number.isFinite(component))
  ) {
    throw new Error(
      `Context embeddings must contain ${CONTEXT_EMBEDDING_DIMENSION} finite values`,
    );
  }

  return `[${embedding.join(',')}]`;
}

export function buildContextSimilarityQuery(
  organizationId: string,
  contextBaseIds: string[],
  queryEmbedding: number[],
  limit: number,
  minSimilarity: number,
): ReturnType<typeof Prisma.sql> {
  if (contextBaseIds.length === 0) {
    throw new Error('At least one context base is required for retrieval');
  }

  const embedding = serializeContextEmbedding(queryEmbedding);
  const maxDistance = similarityToCosineDistance(minSimilarity);

  return Prisma.sql`
    SELECT
      "contextBaseId",
      "data"->>'content' AS "content",
      "data"->>'kind' AS "kind",
      "data"->'metadata' AS "metadata",
      1 - ("embedding" <=> ${embedding}::vector) AS "similarity"
    FROM "context_entries"
    WHERE "organizationId" = ${organizationId}
      AND "isDeleted" = false
      AND "contextBaseId" IN (${Prisma.join(contextBaseIds)})
      AND "embedding" IS NOT NULL
      AND ("embedding" <=> ${embedding}::vector) <= ${maxDistance}
    ORDER BY "embedding" <=> ${embedding}::vector ASC
    LIMIT ${limit}
  `;
}
