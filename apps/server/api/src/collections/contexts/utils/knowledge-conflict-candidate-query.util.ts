import { KnowledgeMemoryScope } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';

/** Chunk pairs below this cosine similarity are about different things. */
export const CONFLICT_MIN_SIMILARITY = 0.78;
/** Chunks of the scanned version compared against the rest of the Brand Truth. */
export const CONFLICT_MAX_TARGET_CHUNKS = 40;
/** Nearest chunks of other versions kept per scanned chunk. */
export const CONFLICT_NEIGHBOURS_PER_CHUNK = 3;
/** Chunk pairs returned for one scan, most similar first. */
export const CONFLICT_MAX_CANDIDATE_PAIRS = 24;

export interface KnowledgeConflictScope {
  brandId: string | null;
  scope: string;
}

export interface KnowledgeConflictCandidateRow {
  otherContent: string;
  otherSourceId: string;
  otherSourceTitle: string;
  otherVersionId: string;
  similarity: number;
  targetContent: string;
}

/**
 * Brand Truth sources that can be retrieved together can contradict each
 * other: an organization-wide source with any other, and a brand source with
 * the same brand's. Personal sources are never part of the shared truth.
 */
export function conflictScopeFilter(
  target: KnowledgeConflictScope,
): ReturnType<typeof Prisma.sql> | null {
  if (target.scope === KnowledgeMemoryScope.ORG) {
    return Prisma.sql`AND os."scope" IN (${KnowledgeMemoryScope.ORG}, ${KnowledgeMemoryScope.BRAND})`;
  }
  if (target.scope === KnowledgeMemoryScope.BRAND && target.brandId) {
    return Prisma.sql`AND (os."scope" = ${KnowledgeMemoryScope.ORG}
      OR (os."scope" = ${KnowledgeMemoryScope.BRAND} AND os."brandId" = ${target.brandId}))`;
  }
  return null;
}

/**
 * For each embedded chunk of one ready Brand Truth version, the nearest chunks
 * of other eligible Brand Truth versions of the same organization. Eligibility
 * mirrors retrieval: ready, active, retained, current, unexpired, visible and
 * not stale, so a pair is only judged when both sides can be cited together.
 */
export function buildConflictCandidateQuery(
  organizationId: string,
  versionId: string,
  sourceId: string,
  target: KnowledgeConflictScope,
): ReturnType<typeof Prisma.sql> | null {
  const scopeFilter = conflictScopeFilter(target);
  if (!scopeFilter) return null;

  return Prisma.sql`
    SELECT
      t."data"->>'content' AS "targetContent",
      n."content" AS "otherContent",
      n."versionId" AS "otherVersionId",
      n."sourceId" AS "otherSourceId",
      n."sourceTitle" AS "otherSourceTitle",
      n."similarity" AS "similarity"
    FROM (
      SELECT e."id", e."embedding", e."data"
      FROM "context_entries" e
      WHERE e."organizationId" = ${organizationId}
        AND e."knowledgeSourceVersionId" = ${versionId}
        AND e."knowledgeSourceId" = ${sourceId}
        AND e."isDeleted" = false
        AND e."embedding" IS NOT NULL
        AND e."embeddingStoredGeneration" = e."embeddingGeneration"
      ORDER BY e."createdAt", e."id"
      LIMIT ${CONFLICT_MAX_TARGET_CHUNKS}
    ) t
    CROSS JOIN LATERAL (
      SELECT
        o."data"->>'content' AS "content",
        ov."id" AS "versionId",
        os."id" AS "sourceId",
        os."title" AS "sourceTitle",
        1 - (o."embedding" <=> t."embedding") AS "similarity"
      FROM "context_entries" o
      JOIN "context_bases" ob ON ob."id" = o."contextBaseId" AND ob."organizationId" = o."organizationId" AND ob."isDeleted" = false
        AND ob."data"->>'knowledgeScope' IS DISTINCT FROM 'personal'
      JOIN "knowledge_source_versions" ov
        ON ov."id" = o."knowledgeSourceVersionId"
        AND ov."sourceId" = o."knowledgeSourceId"
        AND ov."organizationId" = o."organizationId"
      JOIN "knowledge_sources" os
        ON os."id" = o."knowledgeSourceId"
        AND os."organizationId" = o."organizationId"
      WHERE o."organizationId" = ${organizationId}
        AND o."isDeleted" = false
        AND o."embedding" IS NOT NULL
        AND o."embeddingStoredGeneration" = o."embeddingGeneration"
        AND o."knowledgeSourceId" <> ${sourceId}
        AND ov."processingState" = 'READY'
        AND ov."retrievalState" = 'ACTIVE'
        AND ov."retentionState" = 'RETAINED'
        AND ov."isCurrent" = true
        AND ov."isDeleted" = false
        AND (ov."expiresAt" IS NULL OR ov."expiresAt" > NOW())
        AND os."purpose" = 'BRAND_TRUTH'
        AND os."isVisible" = true
        AND os."isDeleted" = false
        AND os."syncState" IS DISTINCT FROM 'STALE'
        AND os."staleAt" IS NULL
        ${scopeFilter}
      ORDER BY o."embedding" <=> t."embedding" ASC
      LIMIT ${CONFLICT_NEIGHBOURS_PER_CHUNK}
    ) n
    WHERE n."similarity" >= ${CONFLICT_MIN_SIMILARITY}
    ORDER BY n."similarity" DESC, n."versionId"
    LIMIT ${CONFLICT_MAX_CANDIDATE_PAIRS}
  `;
}
