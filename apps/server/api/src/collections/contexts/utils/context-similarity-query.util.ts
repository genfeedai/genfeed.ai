import type { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import { CONTEXT_EMBEDDING_DIMENSION } from '@genfeedai/contracts/constants';
import { Prisma } from '@genfeedai/prisma';

export interface ContextSimilarityQueryOptions {
  /** Restrict hits to chunks of these Knowledge sources. */
  knowledgeSourceIds?: string[];
  /** Restrict Knowledge hits to these purposes; legacy chunks stay eligible. */
  knowledgePurposes?: KnowledgeSourcePurpose[];
}

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

/**
 * Tenant-scoped similarity over context entries. Chunks linked to a Knowledge
 * source version are eligible only while that version is ready, active,
 * retained, current, unexpired and its source is visible; the same query
 * returns the source identity so callers can cite the exact version.
 */
export function buildContextSimilarityQuery(
  organizationId: string,
  contextBaseIds: string[],
  queryEmbedding: number[],
  limit: number,
  minSimilarity: number,
  options: ContextSimilarityQueryOptions = {},
): ReturnType<typeof Prisma.sql> {
  if (contextBaseIds.length === 0) {
    throw new Error('At least one context base is required for retrieval');
  }

  const embedding = serializeContextEmbedding(queryEmbedding);
  const maxDistance = similarityToCosineDistance(minSimilarity);
  const sourceFilter = options.knowledgeSourceIds?.length
    ? Prisma.sql`AND e."knowledgeSourceId" IN (${Prisma.join(options.knowledgeSourceIds)})`
    : Prisma.empty;
  const purposeFilter = options.knowledgePurposes?.length
    ? Prisma.sql`AND (e."knowledgeSourceId" IS NULL OR s."purpose"::text IN (${Prisma.join(options.knowledgePurposes)}))`
    : Prisma.empty;

  return Prisma.sql`
    SELECT
      e."contextBaseId",
      e."data"->>'content' AS "content",
      e."data"->>'kind' AS "kind",
      e."data"->'metadata' AS "metadata",
      s."id" AS "knowledgeSourceId",
      s."title" AS "knowledgeSourceTitle",
      s."kind"::text AS "knowledgeSourceKind",
      s."purpose"::text AS "knowledgeSourcePurpose",
      v."id" AS "knowledgeSourceVersionId",
      v."version" AS "knowledgeSourceVersion",
      v."provenance"->>'url' AS "knowledgeSourceUrl",
      1 - (e."embedding" <=> ${embedding}::vector) AS "similarity"
    FROM "context_entries" e
    LEFT JOIN "knowledge_source_versions" v
      ON v."id" = e."knowledgeSourceVersionId"
      AND v."sourceId" = e."knowledgeSourceId"
      AND v."organizationId" = e."organizationId"
    LEFT JOIN "knowledge_sources" s
      ON s."id" = e."knowledgeSourceId"
      AND s."organizationId" = e."organizationId"
    WHERE e."organizationId" = ${organizationId}
      AND e."isDeleted" = false
      AND e."contextBaseId" IN (${Prisma.join(contextBaseIds)})
      AND e."embedding" IS NOT NULL
      AND (
        e."knowledgeSourceVersionId" IS NULL
        OR (
          v."processingState" = 'READY'
          AND v."retrievalState" = 'ACTIVE'
          AND v."retentionState" = 'RETAINED'
          AND v."isCurrent" = true
          AND v."isDeleted" = false
          AND (v."expiresAt" IS NULL OR v."expiresAt" > NOW())
          AND s."isVisible" = true
          AND s."isDeleted" = false
        )
      )
      ${sourceFilter}
      ${purposeFilter}
      AND (e."embedding" <=> ${embedding}::vector) <= ${maxDistance}
    ORDER BY e."embedding" <=> ${embedding}::vector ASC
    LIMIT ${limit}
  `;
}
