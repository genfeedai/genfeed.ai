import type { ContextEntrySimilarityResult } from '@api/collections/contexts/schemas/context-entry.schema';
import { KNOWLEDGE_BASE_PURPOSE } from '@api/collections/contexts/utils/knowledge-source.util';
import {
  KnowledgeMemoryScope,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type {
  BrandContentMemoryHit,
  BrandContentMemoryRetrievalParams,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

/** Brand-scoped retrieval without content-memory source/purpose narrowing. */
export type BrandScopedRetrievalParams = Pick<
  BrandContentMemoryRetrievalParams,
  'brandId' | 'limit' | 'minRelevance' | 'organizationId' | 'query'
>;

/** The context-base columns brand-scope decisions read. */
export type ContextBaseScopeRow = {
  createdById: string | null;
  data: unknown;
  id: string;
  sourceBrandId: string | null;
};

function toDataRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function knowledgeScopeFilter(
  scope: KnowledgeMemoryScope,
): Prisma.ContextBaseWhereInput {
  return { data: { equals: scope, path: ['knowledgeScope'] } };
}

const KNOWLEDGE_BASE_PURPOSE_FILTER: Prisma.ContextBaseWhereInput = {
  data: { equals: KNOWLEDGE_BASE_PURPOSE, path: ['purpose'] },
};

/**
 * A context base belongs to a brand when its column or legacy JSON owner
 * names that brand; a base without any owner is organization-wide. Personal
 * Knowledge bases are never shared with a brand prompt.
 */
export function isContextBaseInBrandScope(
  row: Pick<ContextBaseScopeRow, 'data' | 'sourceBrandId'>,
  brandId: string | undefined,
): boolean {
  const data = toDataRecord(row.data);
  if (data.knowledgeScope === KnowledgeMemoryScope.PERSONAL) {
    return false;
  }

  const owners = [row.sourceBrandId, data.brandId, data.sourceBrand].filter(
    (owner): owner is string => typeof owner === 'string' && owner.length > 0,
  );
  if (owners.length === 0) {
    return true;
  }

  return Boolean(brandId) && owners.every((owner) => owner === brandId);
}

/**
 * Prompt-enhancement candidates: the active brand's own bases plus
 * organization-wide ones. Without a brand only organization-wide bases are
 * eligible, so one brand's saved memory never reaches another brand.
 */
export function buildPromptContextBaseWhere(
  brandId: string | undefined,
  contextBaseIds?: string[],
): Prisma.ContextBaseWhereInput {
  return {
    ...(contextBaseIds?.length ? { id: { in: contextBaseIds } } : {}),
    OR: brandId
      ? [{ sourceBrandId: brandId }, { sourceBrandId: null }]
      : [{ sourceBrandId: null }],
  };
}

/**
 * Brand content memory: bases owned by the brand plus organization-wide
 * Knowledge. Personal Knowledge is never folded into brand generation.
 */
export function buildBrandContentMemoryBaseWhere(
  brandId: string,
): Prisma.ContextBaseWhereInput {
  return {
    OR: [
      { sourceBrandId: brandId },
      { data: { equals: brandId, path: ['brandId'] } },
      {
        AND: [
          { sourceBrandId: null },
          KNOWLEDGE_BASE_PURPOSE_FILTER,
          knowledgeScopeFilter(KnowledgeMemoryScope.ORG),
        ],
      },
    ],
  };
}

/**
 * Automatic chat retrieval for a thread with no validated brand: only
 * organization-wide Knowledge plus the actor's own personal Knowledge, never
 * anything owned by any brand.
 */
export function buildOrgAndPersonalContentMemoryBaseWhere(
  userId: string,
): Prisma.ContextBaseWhereInput {
  return {
    AND: [KNOWLEDGE_BASE_PURPOSE_FILTER],
    OR: [
      {
        AND: [
          { sourceBrandId: null },
          knowledgeScopeFilter(KnowledgeMemoryScope.ORG),
        ],
      },
      {
        AND: [
          { sourceBrandId: null },
          { createdById: userId },
          knowledgeScopeFilter(KnowledgeMemoryScope.PERSONAL),
        ],
      },
    ],
  };
}

/**
 * Defense-in-depth mirror of {@link isContextBaseInBrandScope} for the
 * no-brand automatic retrieval path: a base owned by any brand is always
 * excluded, and personal-scope bases are eligible only for their own creator.
 */
export function isContextBaseInOrgOrPersonalScope(
  row: Pick<ContextBaseScopeRow, 'createdById' | 'data' | 'sourceBrandId'>,
  userId: string,
): boolean {
  const data = toDataRecord(row.data);
  const owners = [row.sourceBrandId, data.brandId, data.sourceBrand].filter(
    (owner): owner is string => typeof owner === 'string' && owner.length > 0,
  );
  if (owners.length > 0) {
    return false;
  }

  if (data.knowledgeScope === KnowledgeMemoryScope.PERSONAL) {
    return row.createdById === userId;
  }

  return data.knowledgeScope === KnowledgeMemoryScope.ORG;
}

/** Knowledge bases owned by the brand plus organization-wide Knowledge bases. */
export function buildBrandKnowledgeBaseWhere(
  brandId: string,
): Prisma.ContextBaseWhereInput {
  return {
    AND: [KNOWLEDGE_BASE_PURPOSE_FILTER],
    OR: [
      {
        AND: [
          { sourceBrandId: brandId },
          knowledgeScopeFilter(KnowledgeMemoryScope.BRAND),
        ],
      },
      {
        AND: [
          { sourceBrandId: null },
          knowledgeScopeFilter(KnowledgeMemoryScope.ORG),
        ],
      },
    ],
  };
}

/** Maps similarity hits to content-memory hits labelled by their base. */
export function toBrandContentMemoryHits(
  entries: ContextEntrySimilarityResult[],
  bases: ContextBaseScopeRow[],
): BrandContentMemoryHit[] {
  const labelByBase = new Map(
    bases.map((base) => {
      const data = toDataRecord(base.data);
      const purpose =
        typeof data.purpose === 'string' ? data.purpose : undefined;
      const label =
        typeof data.label === 'string' ? data.label : (purpose ?? 'context');
      return [base.id, label] as const;
    }),
  );

  return entries.map((entry) => {
    const metadata = entry.metadata ?? {};
    const kind =
      entry.kind ||
      (typeof metadata.kind === 'string' ? metadata.kind : undefined);
    return {
      ...(entry.citation ? { citation: entry.citation } : {}),
      content: entry.content,
      kind,
      metadata,
      relevance: entry.similarity,
      source: entry.citation?.title ?? labelByBase.get(entry.contextBaseId),
    };
  });
}

/** Keeps only BRAND_TRUTH passages; inspiration and research never pass. */
export function toBrandKnowledgeHits(
  entries: ContextEntrySimilarityResult[],
): BrandContentMemoryHit[] {
  return entries.flatMap((entry) => {
    const citation = entry.citation;
    if (citation?.purpose !== KnowledgeSourcePurpose.BRAND_TRUTH) {
      return [];
    }
    return [
      {
        citation,
        content: entry.content,
        ...(entry.kind ? { kind: entry.kind } : {}),
        metadata: entry.metadata ?? {},
        relevance: entry.similarity,
        source: citation.title,
      },
    ];
  });
}
