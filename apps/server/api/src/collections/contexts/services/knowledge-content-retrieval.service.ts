import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { ContextEntrySimilarityResult } from '@api/collections/contexts/schemas/context-entry.schema';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import {
  type BrandScopedRetrievalParams,
  buildBrandContentMemoryBaseWhere,
  buildBrandKnowledgeBaseWhere,
  buildOrgAndPersonalContentMemoryBaseWhere,
  type ContextBaseScopeRow,
  isContextBaseInBrandScope,
  isContextBaseInOrgOrPersonalScope,
  toBrandContentMemoryHits,
  toBrandKnowledgeHits,
} from '@api/collections/contexts/utils/context-brand-scope.util';
import type { ContextSimilarityQueryOptions } from '@api/collections/contexts/utils/context-similarity-query.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import type {
  BrandContentMemoryHit,
  BrandContentMemoryRetrievalParams,
  OrgAndPersonalContentMemoryRetrievalParams,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

export const SELECTED_KNOWLEDGE_PASSAGE_BUDGET = 8;

/**
 * Brand-, organization- and personal-scope Knowledge retrieval for
 * generation and chat grounding. Built on `ContextsService`'s shared
 * embedding + pgvector similarity primitives (`generateEmbedding`,
 * `findSimilarEntries`) rather than duplicating that machinery — split into
 * its own service purely to keep `contexts.service.ts` under the
 * runtime-complexity file-size guard; behavior is unchanged (#5144).
 */
@Injectable()
export class KnowledgeContentRetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextsService: ContextsService,
    private readonly brandAccessService: BrandAccessService,
  ) {}

  /**
   * Brand-scoped content memory retrieval over Postgres pgvector.
   * This is the day-one vector store for generation context (not a separate
   * vector product). Prefer harness-performance-winners + brand libraries.
   */
  async retrieveBrandContentMemory(
    params: BrandContentMemoryRetrievalParams,
  ): Promise<BrandContentMemoryHit[]> {
    // An explicit selection that resolved to no sources (an empty space)
    // matches nothing; it must never fall through to the brand's whole memory.
    if (params.knowledgeSourceIds?.length === 0) {
      return [];
    }
    const { bases, entries } = await this.findBrandScopedEntries(
      params,
      buildBrandContentMemoryBaseWhere,
      {
        ...(params.knowledgeSourceIds?.length
          ? { knowledgeSourceIds: params.knowledgeSourceIds }
          : {}),
        ...(params.knowledgePurposes?.length
          ? { knowledgePurposes: params.knowledgePurposes }
          : {}),
        ...(params.isKnowledgeOnly ? { isKnowledgeOnly: true } : {}),
      },
    );
    return toBrandContentMemoryHits(entries, bases);
  }

  async retrieveSelectedBrandContentMemory(
    params: BrandContentMemoryRetrievalParams,
    sourceIds: readonly string[],
  ): Promise<BrandContentMemoryHit[]> {
    if (
      !sourceIds.length ||
      sourceIds.length > SELECTED_KNOWLEDGE_PASSAGE_BUDGET ||
      sourceIds.some((id) => !id.trim()) ||
      new Set(sourceIds).size !== sourceIds.length
    ) {
      throw new Error('knowledge_unavailable');
    }
    const query = params.query.trim();
    const brandId = params.brandId?.trim();
    if (!query || !brandId) throw new Error('knowledge_unavailable');
    await this.brandAccessService.assert(params, brandId);
    const rows = await this.prisma.contextBase.findMany({
      select: { createdById: true, data: true, id: true, sourceBrandId: true },
      where: scopedWhere(
        params.organizationId,
        buildBrandContentMemoryBaseWhere(brandId),
      ),
    });
    const bases = rows.filter((row) => isContextBaseInBrandScope(row, brandId));
    if (!bases.length) throw new Error('knowledge_unavailable');
    // The vector belongs to this request; every selected source shares one paid embedding.
    const embedding = await this.contextsService.generateEmbedding(query);
    const baseIds = bases.map((base) => base.id);
    const hits: BrandContentMemoryHit[] = [];
    const baseQuota = Math.floor(
      SELECTED_KNOWLEDGE_PASSAGE_BUDGET / sourceIds.length,
    );
    const remainder = SELECTED_KNOWLEDGE_PASSAGE_BUDGET % sourceIds.length;
    for (const [index, sourceId] of sourceIds.entries()) {
      const quota = baseQuota + (index < remainder ? 1 : 0);
      const entries = await this.contextsService.findSimilarEntries(
        params.organizationId,
        baseIds,
        embedding,
        quota,
        0,
        {
          knowledgeSourceIds: [sourceId],
          isKnowledgeOnly: true,
          knowledgeBrandId: brandId,
          ...(params.knowledgePurposes?.length
            ? { knowledgePurposes: params.knowledgePurposes }
            : {}),
        },
      );
      const selected = toBrandContentMemoryHits(entries, bases);
      if (
        !selected.length ||
        selected.length > quota ||
        selected.some((hit) => hit.citation?.sourceId !== sourceId)
      ) {
        throw new Error('knowledge_unavailable');
      }
      hits.push(...selected);
    }
    return hits;
  }

  /**
   * Automatic chat retrieval for a thread with no validated brand:
   * organization-wide Knowledge plus the actor's own personal Knowledge.
   * Never returns brand-owned material — that requires
   * {@link retrieveBrandContentMemory} with an explicit brand id.
   */
  async retrieveOrgAndPersonalContentMemory(
    params: OrgAndPersonalContentMemoryRetrievalParams,
  ): Promise<BrandContentMemoryHit[]> {
    const { bases, entries } =
      await this.findOrgAndPersonalScopedEntries(params);
    return toBrandContentMemoryHits(entries, bases);
  }

  /**
   * Authoritative brand Knowledge for prompt injection: only chunks of
   * BRAND_TRUTH sources owned by this brand or shared organization-wide, whose
   * current version is ready and retrievable. Inspiration and research never
   * reach this lane — they stay behind the explicit `search_knowledge` tool.
   */
  async retrieveBrandKnowledge(
    params: BrandScopedRetrievalParams,
  ): Promise<BrandContentMemoryHit[]> {
    const { entries } = await this.findBrandScopedEntries(
      params,
      buildBrandKnowledgeBaseWhere,
      {
        isKnowledgeOnly: true,
        knowledgePurposes: [KnowledgeSourcePurpose.BRAND_TRUTH],
      },
    );
    return toBrandKnowledgeHits(entries);
  }

  /**
   * Similarity search over the brand's in-scope context bases. An empty brand
   * id would collapse `{ sourceBrandId: undefined }` into an unscoped OR
   * branch and read every brand's memory, so it returns nothing instead.
   */
  private async findBrandScopedEntries(
    params: BrandScopedRetrievalParams,
    buildBaseWhere: (brandId: string) => Prisma.ContextBaseWhereInput,
    options: ContextSimilarityQueryOptions,
  ): Promise<{
    bases: ContextBaseScopeRow[];
    entries: ContextEntrySimilarityResult[];
  }> {
    const query = params.query.trim();
    const brandId = params.brandId?.trim();
    if (!query || !brandId) {
      return { bases: [], entries: [] };
    }

    await this.brandAccessService.assert(params, brandId);
    const rows = await this.prisma.contextBase.findMany({
      select: { createdById: true, data: true, id: true, sourceBrandId: true },
      where: scopedWhere(params.organizationId, buildBaseWhere(brandId)),
    });
    const bases = rows.filter((row) => isContextBaseInBrandScope(row, brandId));
    if (bases.length === 0) {
      return { bases, entries: [] };
    }

    const queryEmbedding = await this.contextsService.generateEmbedding(query);
    const entries = await this.contextsService.findSimilarEntries(
      params.organizationId,
      bases.map((base) => base.id),
      queryEmbedding,
      params.limit ?? 5,
      params.minRelevance ?? 0.65,
      { ...options, knowledgeBrandId: brandId },
    );
    return { bases, entries };
  }

  /**
   * Similarity search over org-wide plus the actor's own personal-scope
   * context bases, for threads without a validated brand. Brand-owned bases
   * are never eligible here, whatever their label or legacy `data.brandId`.
   */
  private async findOrgAndPersonalScopedEntries(
    params: OrgAndPersonalContentMemoryRetrievalParams,
  ): Promise<{
    bases: ContextBaseScopeRow[];
    entries: ContextEntrySimilarityResult[];
  }> {
    const query = params.query.trim();
    const userId = params.userId?.trim();
    if (!query || !userId) {
      return { bases: [], entries: [] };
    }

    const rows = await this.prisma.contextBase.findMany({
      select: { createdById: true, data: true, id: true, sourceBrandId: true },
      where: scopedWhere(
        params.organizationId,
        buildOrgAndPersonalContentMemoryBaseWhere(userId),
      ),
    });
    const bases = rows.filter((row) =>
      isContextBaseInOrgOrPersonalScope(row, userId),
    );
    if (bases.length === 0) {
      return { bases, entries: [] };
    }

    const queryEmbedding = await this.contextsService.generateEmbedding(query);
    const entries = await this.contextsService.findSimilarEntries(
      params.organizationId,
      bases.map((base) => base.id),
      queryEmbedding,
      params.limit ?? 5,
      params.minRelevance ?? 0.65,
      { isKnowledgeOnly: true, knowledgeOrgAndPersonalUserId: userId },
    );
    return { bases, entries };
  }
}
