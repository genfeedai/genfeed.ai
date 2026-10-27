import { buildMemorySourceSnapshotHashQuery } from '@api/collections/contexts/utils/context-embedding-claim-query.util';
import type { KnowledgeSearchPosition } from '@api/collections/contexts/utils/knowledge-search-cursor.util';
import {
  KnowledgeMemoryScope,
  type KnowledgeSourceKind,
  type KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { CONTEXT_EMBEDDING_DIMENSION } from '@genfeedai/contracts/constants';
import { Prisma } from '@genfeedai/prisma';

/** Weight of the exact-name match in the hybrid score; the vector similarity weighs 1. */
export const KNOWLEDGE_SEARCH_EXACT_TERM_WEIGHT = 0.5;

/**
 * Explicit Knowledge search: hybrid keyword + vector ranking, filters and
 * keyset paging over the same eligibility rules as retrieval. A passage that
 * contains one of `exactTerms` is admitted even below the similarity
 * threshold, but only if it has a current vector, so eligibility never
 * loosens. Each row's score is immutable for a given query, so `after` pages
 * deterministically.
 */
export interface KnowledgeSearchQueryOptions {
  after?: KnowledgeSearchPosition;
  exactTerms: string[];
  kinds?: KnowledgeSourceKind[];
  occurredFrom?: Date;
  occurredTo?: Date;
  /** `timeline` orders by capture time, oldest first, instead of by score. */
  order?: 'score' | 'timeline';
}

export interface ContextSimilarityQueryOptions {
  /** Hybrid ranking, filters and paging for `search_knowledge`. */
  search?: KnowledgeSearchQueryOptions;
  /** Canonical authenticated viewer; never a request-body identity. */
  viewerUserId?: string;
  /** Restrict hits to chunks of these Knowledge sources. */
  knowledgeSourceIds?: string[];
  /** Restrict Knowledge hits to these purposes; legacy chunks stay eligible. */
  knowledgePurposes?: KnowledgeSourcePurpose[];
  /**
   * Restrict Knowledge-linked hits to sources owned by this brand or shared
   * organization-wide. Legacy (unlinked) chunks stay eligible. Mutually
   * exclusive with {@link knowledgeOrgAndPersonalUserId}.
   */
  knowledgeBrandId?: string;
  /**
   * Restrict Knowledge-linked hits to organization-wide sources plus this
   * user's own personal sources; never brand-owned sources. Used for
   * automatic retrieval on threads with no validated brand. Mutually
   * exclusive with {@link knowledgeBrandId}.
   */
  knowledgeOrgAndPersonalUserId?: string;
  /** Only return chunks linked to a Knowledge source version. */
  isKnowledgeOnly?: boolean;
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
  const brandScopeFilter = options.knowledgeBrandId
    ? Prisma.sql`AND (
        e."knowledgeSourceId" IS NULL
        OR s."scope" = ${KnowledgeMemoryScope.ORG}
        OR (s."scope" = ${KnowledgeMemoryScope.BRAND} AND s."brandId" = ${options.knowledgeBrandId})
      )`
    : Prisma.empty;
  const orgAndPersonalScopeFilter = options.knowledgeOrgAndPersonalUserId
    ? Prisma.sql`AND (
        e."knowledgeSourceId" IS NULL
        OR s."scope" = ${KnowledgeMemoryScope.ORG}
        OR (s."scope" = ${KnowledgeMemoryScope.PERSONAL} AND s."userId" = ${options.knowledgeOrgAndPersonalUserId})
      )`
    : Prisma.empty;
  const knowledgeOnlyFilter = options.isKnowledgeOnly
    ? Prisma.sql`AND e."knowledgeSourceId" IS NOT NULL`
    : Prisma.empty;

  const search = options.search;
  const exactTermCount = search?.exactTerms.length ?? 0;
  const exactTermMatches =
    search && exactTermCount > 0
      ? Prisma.join(
          search.exactTerms.map(
            (term) =>
              Prisma.sql`(strpos(lower(COALESCE(e."data"->>'content', '')), ${term.toLowerCase()}) > 0)::int`,
          ),
          ' + ',
        )
      : Prisma.sql`0`;
  const searchColumns = search
    ? Prisma.sql`,
      e."id" AS "entryId",
      v."observedAt" AS "observedAt",
      ROUND(
        (1 - (e."embedding" <=> ${embedding}::vector))::numeric
          + ${KNOWLEDGE_SEARCH_EXACT_TERM_WEIGHT}::numeric * (${exactTermMatches})::numeric / ${Math.max(exactTermCount, 1)}::numeric,
        6
      ) AS "score"`
    : Prisma.empty;
  const kindFilter = search?.kinds?.length
    ? Prisma.sql`AND s."kind"::text IN (${Prisma.join(search.kinds)})`
    : Prisma.empty;
  const occurredFromFilter = search?.occurredFrom
    ? Prisma.sql`AND v."observedAt" >= ${search.occurredFrom}`
    : Prisma.empty;
  const occurredToFilter = search?.occurredTo
    ? Prisma.sql`AND v."observedAt" <= ${search.occurredTo}`
    : Prisma.empty;
  const similarityAdmission =
    search && exactTermCount > 0
      ? Prisma.sql`AND ((e."embedding" <=> ${embedding}::vector) <= ${maxDistance} OR (${exactTermMatches}) >= 1)`
      : Prisma.sql`AND (e."embedding" <=> ${embedding}::vector) <= ${maxDistance}`;

  const body = Prisma.sql`
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
      1 - (e."embedding" <=> ${embedding}::vector) AS "similarity"${searchColumns}
    FROM "context_entries" e
    JOIN "context_bases" b ON b."id" = e."contextBaseId" AND b."organizationId" = e."organizationId" AND b."isDeleted" = false
    LEFT JOIN "agent_memories" m ON m."id" = e."sourceAgentMemoryId" AND m."organizationId" = e."organizationId"
    LEFT JOIN "knowledge_source_versions" v
      ON v."id" = e."knowledgeSourceVersionId"
      AND v."sourceId" = e."knowledgeSourceId"
      AND v."organizationId" = e."organizationId"
    LEFT JOIN "knowledge_sources" s
      ON s."id" = e."knowledgeSourceId"
      AND s."organizationId" = e."organizationId"
    WHERE e."organizationId" = ${organizationId}
      AND e."isDeleted" = false
      AND (b."data"->>'knowledgeScope' IS DISTINCT FROM 'personal' OR b."createdById" = ${options.viewerUserId ?? null})
      AND (COALESCE(NULLIF(b."sourceBrandId", ''), NULLIF(b."data"->>'brandId', ''), NULLIF(b."data"->>'sourceBrand', '')) IS NULL
        OR EXISTS (SELECT 1 FROM "brands" bb WHERE bb."id" = COALESCE(NULLIF(b."sourceBrandId", ''), NULLIF(b."data"->>'brandId', ''), NULLIF(b."data"->>'sourceBrand', ''))
          AND bb."organizationId" = e."organizationId" AND bb."isDeleted" = false))

      AND e."contextBaseId" IN (${Prisma.join(contextBaseIds)})
      AND e."embedding" IS NOT NULL
      AND e."embeddingStoredGeneration" = e."embeddingGeneration"
      AND (
        e."sourceAgentMemoryId" IS NULL
        OR (
          m."id" IS NOT NULL AND m."isDeleted" = false
          AND e."sourceSnapshotHash" = ${buildMemorySourceSnapshotHashQuery()}
          AND m."content" = e."data"->>'content'
          AND m."scope" IN ('personal', 'org', 'brand')
          AND (m."scope" <> 'personal' OR m."userId" = ${options.viewerUserId ?? null})
          AND EXISTS (SELECT 1 FROM "users" u WHERE u."id" = m."userId" AND u."isDeleted" = false)
          AND EXISTS (SELECT 1 FROM "organizations" o WHERE o."id" = e."organizationId" AND o."isDeleted" = false)
          AND (m."brandId" IS NULL OR EXISTS (
            SELECT 1 FROM "brands" mb WHERE mb."id" = m."brandId" AND mb."organizationId" = e."organizationId" AND mb."isDeleted" = false))
          AND m."brandId" IS NOT DISTINCT FROM COALESCE(NULLIF(b."sourceBrandId", ''), NULLIF(b."data"->>'brandId', ''), NULLIF(b."data"->>'sourceBrand', ''))
          AND (NULLIF(b."sourceBrandId", '') IS NULL OR b."sourceBrandId" = m."brandId")
          AND (NULLIF(b."data"->>'brandId', '') IS NULL OR b."data"->>'brandId' = m."brandId")
          AND (NULLIF(b."data"->>'sourceBrand', '') IS NULL OR b."data"->>'sourceBrand' = m."brandId")
          AND (b."data"->>'knowledgeScope' IS DISTINCT FROM 'personal' OR b."createdById" = m."userId")
          AND (m."campaignId" IS NULL OR EXISTS (
            SELECT 1 FROM "agent_campaigns" c WHERE c."id" = m."campaignId" AND c."organizationId" = e."organizationId"
              AND c."isDeleted" = false AND c."userId" = m."userId" AND c."brandId" IS NOT DISTINCT FROM m."brandId"))
        )
      )

      AND (
        e."knowledgeSourceVersionId" IS NULL
        OR (
          v."processingState" = 'READY'
          AND v."retrievalState" = 'ACTIVE'
          AND v."retentionState" = 'RETAINED'
          AND v."isCurrent" = true
          AND v."isDeleted" = false
          AND (v."expiresAt" IS NULL OR v."expiresAt" > NOW())
          AND (s."scope" <> 'personal' OR (s."userId" = ${options.viewerUserId ?? null} AND b."createdById" = s."userId"))
          AND s."isVisible" = true
          AND s."isDeleted" = false
          AND (s."syncState" IS DISTINCT FROM 'STALE')
          AND s."staleAt" IS NULL
        )
      )
      ${sourceFilter}
      ${purposeFilter}
      ${brandScopeFilter}
      ${orgAndPersonalScopeFilter}
      ${knowledgeOnlyFilter}
      ${kindFilter}
      ${occurredFromFilter}
      ${occurredToFilter}
      ${similarityAdmission}
  `;

  if (!search) {
    return Prisma.sql`
      ${body}
      ORDER BY e."embedding" <=> ${embedding}::vector ASC
      LIMIT ${limit}
    `;
  }

  // Keyset order: the score is rounded to six places and ties break on the
  // entry id, so the position after any row is one comparison.
  const after = search.after;
  if (search.order === 'timeline') {
    const afterTimeline =
      after?.occurredAt !== undefined
        ? Prisma.sql`WHERE (r."observedAt", r."entryId") > (${new Date(after.occurredAt)}, ${after.entryId})`
        : Prisma.empty;
    return Prisma.sql`
      SELECT * FROM (${body}) r
      ${afterTimeline}
      ORDER BY r."observedAt" ASC, r."entryId" ASC
      LIMIT ${limit}
    `;
  }
  const afterScore =
    after?.score !== undefined
      ? Prisma.sql`WHERE (r."score", r."entryId") < (${after.score}::numeric, ${after.entryId})`
      : Prisma.empty;
  return Prisma.sql`
    SELECT * FROM (${body}) r
    ${afterScore}
    ORDER BY r."score" DESC, r."entryId" DESC
    LIMIT ${limit}
  `;
}
