import { AddEntryDto } from '@api/collections/contexts/dto/add-entry.dto';
import { AutoCreateContextDto } from '@api/collections/contexts/dto/autocreate.dto';
import { CreateContextDto } from '@api/collections/contexts/dto/create-context.dto';
import { EnhancePromptDto } from '@api/collections/contexts/dto/enhance-prompt.dto';
import { QueryContextDto } from '@api/collections/contexts/dto/query.dto';
import { UpdateContextDto } from '@api/collections/contexts/dto/update-context.dto';
import type { ContextBase } from '@api/collections/contexts/schemas/context-base.schema';
import type {
  ContextEntry,
  ContextEntryKnowledgeLink,
  ContextEntryPendingEmbeddingRow,
  ContextEntrySimilarityResult,
  ContextEntrySimilarityRow,
  ContextPromptEnhancement,
  ContextPromptEntry,
} from '@api/collections/contexts/schemas/context-entry.schema';
import {
  type BrandScopedRetrievalParams,
  buildBrandContentMemoryBaseWhere,
  buildBrandKnowledgeBaseWhere,
  buildOrgAndPersonalContentMemoryBaseWhere,
  buildPromptContextBaseWhere,
  type ContextBaseScopeRow,
  isContextBaseInBrandScope,
  isContextBaseInOrgOrPersonalScope,
  toBrandContentMemoryHits,
  toBrandKnowledgeHits,
} from '@api/collections/contexts/utils/context-brand-scope.util';
import {
  buildEmbeddingFailureQuery,
  buildEmptyContentFailQuery,
  buildPendingEmbeddingClaimQuery,
} from '@api/collections/contexts/utils/context-embedding-claim-query.util';
import {
  buildContextSimilarityQuery,
  type ContextSimilarityQueryOptions,
  serializeContextEmbedding,
} from '@api/collections/contexts/utils/context-similarity-query.util';
import {
  isKnowledgeSourceKind,
  isKnowledgeSourcePurpose,
} from '@api/collections/contexts/utils/knowledge-source.util';
import { chunkText } from '@api/collections/contexts/utils/text-chunker.util';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { scopedWhere } from '@api/index';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { RouterService } from '@api/services/router/router.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import {
  KnowledgeSourcePurpose,
  ModelCategory,
  PostVisibility,
  parsePlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  postExecutionStateReadFilter,
  postVisibilityReadFilter,
} from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type {
  BrandContentMemoryHit,
  BrandContentMemoryRetrievalParams,
  KnowledgeRetrievalCitation,
  OrgAndPersonalContentMemoryRetrievalParams,
} from '@genfeedai/contracts/interfaces';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class ContextsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly replicateService: ReplicateService,
    private readonly routerService: RouterService,
  ) {}

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Throws BadRequestException when the supplied brandId does not belong to
   * the given organizationId. Used to prevent cross-tenant brand linking.
   */
  private async assertBrandOwnership(
    brandId: string,
    organizationId: string,
  ): Promise<void> {
    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, { id: brandId }),
    });

    if (!brand) {
      throw new BadRequestException(
        `Brand ${brandId} does not belong to this organization`,
      );
    }
  }

  private getDataRecord(value: unknown): Record<string, unknown> {
    return this.isPlainObject(value) ? { ...value } : {};
  }

  private normalizeContextBase(contextBase: ContextBase): ContextBase {
    return {
      ...contextBase,
      ...this.getDataRecord(contextBase.data),
    };
  }

  private normalizeContextBases(contextBases: ContextBase[]): ContextBase[] {
    return contextBases.map((contextBase) =>
      this.normalizeContextBase(contextBase),
    );
  }

  private normalizeContextEntry(entry: ContextEntry): ContextEntry {
    return {
      ...entry,
      ...this.getDataRecord(entry.data),
    };
  }

  private normalizeContextEntries(entries: ContextEntry[]): ContextEntry[] {
    return entries.map((entry) => this.normalizeContextEntry(entry));
  }

  private async adjustContextBaseMetric(
    contextBaseId: string,
    organizationId: string,
    metric: 'entryCount' | 'usageCount',
    delta: number,
  ): Promise<void> {
    await this.adjustContextBaseMetrics(
      [contextBaseId],
      organizationId,
      metric,
      delta,
    );
  }

  /**
   * Atomically adjust a JSONB usage metric on every listed context base in one
   * statement. The previous read-modify-write of the whole `data` blob lost
   * updates under concurrency; `jsonb_set` moves the increment into Postgres
   * so parallel requests serialize on the row instead of overwriting each
   * other. The metric name is a compile-time union but still bound as a
   * parameter (ARRAY[$n] path / ->> $n) — nothing is interpolated.
   */
  private async adjustContextBaseMetrics(
    contextBaseIds: string[],
    organizationId: string,
    metric: 'entryCount' | 'usageCount',
    delta: number,
  ): Promise<void> {
    if (contextBaseIds.length === 0) {
      return;
    }

    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "context_bases"
      SET "data" = jsonb_set(
        COALESCE("data", '{}'::jsonb),
        ARRAY[${metric}],
        to_jsonb(GREATEST(0, COALESCE("data"->>${metric}, '0')::int + ${delta}))
      )
      WHERE "organizationId" = ${organizationId}
        AND "isDeleted" = false
        AND "id" IN (${Prisma.join(contextBaseIds)})
    `);
  }

  @HandleErrors('create context base', 'contexts')
  async create(
    dto: CreateContextDto,
    organizationId: string,
    userId?: string,
  ): Promise<ContextBase> {
    this.logger.debug('Creating context base', {
      label: dto.label,
      organizationId,
      type: dto.type,
    });

    // Validate that the supplied sourceBrand belongs to the caller's org to
    // prevent cross-tenant brand linking.
    if (dto.sourceBrand) {
      await this.assertBrandOwnership(dto.sourceBrand, organizationId);
    }

    const contextBase = await this.prisma.contextBase.create({
      data: {
        ...(userId ? { createdById: userId } : {}),
        ...(dto.sourceBrand ? { sourceBrandId: dto.sourceBrand } : {}),
        data: {
          ...dto,
          category: dto.type,
          entryCount: 0,
          isActive: true,
          type: dto.type,
          usageCount: 0,
        },
        organizationId,
      },
    });

    this.logger.debug('Context base created', {
      contextBaseId: contextBase.id,
    });

    return this.normalizeContextBase(contextBase);
  }

  async findAll(
    organizationId: string,
    filters?: {
      category?: string;
      isActive?: boolean;
      search?: string;
    },
  ): Promise<ContextBase[]> {
    const rows = await this.prisma.contextBase.findMany({
      orderBy: { createdAt: 'desc' },
      where: scopedWhere(organizationId, {}),
    });

    let results = rows;

    if (
      filters?.category ||
      filters?.isActive !== undefined ||
      filters?.search
    ) {
      results = rows.filter((row) => {
        const d = (row.data as Record<string, unknown>) ?? {};
        if (filters?.category && d.category !== filters.category) return false;
        if (filters?.isActive !== undefined && d.isActive !== filters.isActive)
          return false;
        if (filters?.search) {
          const label = (d.label as string) ?? '';
          if (!label.toLowerCase().includes(filters.search.toLowerCase()))
            return false;
        }
        return true;
      });
    }

    return this.normalizeContextBases(results);
  }

  async findOne(id: string, organizationId: string): Promise<ContextBase> {
    const contextBase = await findOrThrow(
      this.prisma.contextBase,
      {
        where: scopedWhere(organizationId, { id }),
      },
      'Context base',
    );

    return this.normalizeContextBase(contextBase);
  }

  async update(
    id: string,
    dto: UpdateContextDto,
    organizationId: string,
  ): Promise<ContextBase> {
    const existing = await findOrThrow(
      this.prisma.contextBase,
      { where: scopedWhere(organizationId, { id }) },
      'Context base',
    );

    // Validate that the supplied sourceBrand belongs to the caller's org to
    // prevent cross-tenant brand linking on update.
    if (dto.sourceBrand) {
      await this.assertBrandOwnership(dto.sourceBrand, organizationId);
    }

    const contextBase = await this.prisma.contextBase.update({
      data: {
        ...(dto.sourceBrand !== undefined
          ? { sourceBrandId: dto.sourceBrand }
          : {}),
        data: {
          ...this.getDataRecord(existing.data),
          ...dto,
          ...(dto.type ? { category: dto.type } : {}),
        },
      },
      where: { id },
    });

    return this.normalizeContextBase(contextBase);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    await findOrThrow(
      this.prisma.contextBase,
      { where: scopedWhere(organizationId, { id }) },
      'Context base',
    );

    await this.prisma.contextBase.update({
      data: { isDeleted: true },
      where: { id },
    });

    await this.prisma.contextEntry.updateMany({
      data: { isDeleted: true },
      where: { contextBaseId: id, isDeleted: false, organizationId },
    });
  }

  async addEntry(
    contextBaseId: string,
    dto: AddEntryDto,
    organizationId: string,
    knowledgeLink?: ContextEntryKnowledgeLink,
  ): Promise<ContextEntry> {
    try {
      this.logger.debug('Adding entry to context base', {
        contextBaseId,
        organizationId,
      });

      await this.findOne(contextBaseId, organizationId);

      const embedding = await this.generateEmbedding(dto.content);

      const metadata = (dto.metadata ?? {}) as Record<string, unknown>;
      const kind =
        typeof metadata.kind === 'string' && metadata.kind.trim()
          ? metadata.kind.trim()
          : undefined;

      const entry = await this.prisma.contextEntry.create({
        data: {
          contextBaseId,
          ...(knowledgeLink ?? {}),
          data: toPrismaJson({
            content: dto.content,
            ...(kind ? { kind } : {}),
            metadata,
            relevanceWeight: dto.relevanceWeight || 1.0,
          }),
          organizationId,
        },
      });

      await this.writeEntryEmbedding(entry.id, organizationId, embedding);

      await this.adjustContextBaseMetric(
        contextBaseId,
        organizationId,
        'entryCount',
        1,
      );

      this.logger.debug('Entry added', { entryId: entry.id });

      return this.normalizeContextEntry(entry);
    } catch (error: unknown) {
      this.logger.error('Failed to add entry', { error });
      throw error;
    }
  }

  async removeEntry(
    contextBaseId: string,
    entryId: string,
    organizationId: string,
  ): Promise<void> {
    await findOrThrow(
      this.prisma.contextEntry,
      {
        where: scopedWhere(organizationId, { contextBaseId, id: entryId }),
      },
      'Entry',
    );

    await this.prisma.contextEntry.update({
      data: { isDeleted: true },
      where: { id: entryId },
    });

    await this.adjustContextBaseMetric(
      contextBaseId,
      organizationId,
      'entryCount',
      -1,
    );
  }

  async enhancePrompt(
    dto: EnhancePromptDto,
    organizationId: string,
  ): Promise<ContextPromptEnhancement> {
    try {
      this.logger.debug('Retrieving prompt context', {
        brandId: dto.brandId,
        contentType: dto.contentType,
        organizationId,
      });

      const contextBases = await this.getRelevantContextBases(
        organizationId,
        dto,
      );

      if (contextBases.length === 0) {
        return {
          context: [],
          enhancedPrompt: dto.prompt,
          estimatedQualityBoost: 0,
          originalPrompt: dto.prompt,
        };
      }

      const relevantEntries = await this.retrieveRelevantEntries(
        contextBases,
        dto.prompt,
        dto.maxResults || 5,
        organizationId,
      );

      if (relevantEntries.length === 0) {
        return {
          context: [],
          enhancedPrompt: dto.prompt,
          estimatedQualityBoost: 0,
          originalPrompt: dto.prompt,
        };
      }

      await this.adjustContextBaseMetrics(
        contextBases.map((base) => String(base.id)),
        organizationId,
        'usageCount',
        1,
      );

      const avgRelevance =
        relevantEntries.reduce((sum, e) => sum + e.relevance, 0) /
        relevantEntries.length;

      return {
        context: relevantEntries,
        enhancedPrompt: dto.prompt,
        estimatedQualityBoost: Math.round(avgRelevance * 50),
        originalPrompt: dto.prompt,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to enhance prompt', { error });
      throw error;
    }
  }

  async queryContext(
    dto: QueryContextDto,
    organizationId: string,
  ): Promise<
    Array<{
      content: string;
      relevance: number;
      metadata?: Record<string, unknown>;
    }>
  > {
    try {
      await this.findOne(dto.contextBaseId, organizationId);
      const queryEmbedding = await this.generateEmbedding(dto.query);
      const entries = await this.findSimilarEntries(
        organizationId,
        [dto.contextBaseId],
        queryEmbedding,
        dto.limit || 10,
        dto.minRelevance || 0.7,
      );

      return entries.map((e) => ({
        content: e.content,
        metadata: e.metadata,
        relevance: e.similarity,
      }));
    } catch (error: unknown) {
      this.logger.error('Failed to query context', { error });
      throw error;
    }
  }

  /**
   * Brand-scoped content memory retrieval over Postgres pgvector.
   * This is the day-one vector store for generation context (not a separate
   * vector product). Prefer harness-performance-winners + brand libraries.
   */
  async retrieveBrandContentMemory(
    params: BrandContentMemoryRetrievalParams,
  ): Promise<BrandContentMemoryHit[]> {
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

  async autoCreateFromAccount(
    dto: AutoCreateContextDto,
    organizationId: string,
    userId?: string,
  ): Promise<ContextBase> {
    try {
      const contextBase = await this.create(
        {
          description: dto.description,
          label: dto.label,
          source: 'auto-generated',
          sourceBrand: dto.brandId?.toString(),
          sourceUrl: undefined,
          type: 'content_library',
        },
        organizationId,
        userId,
      );

      // posts.platform is product lowercase (String), not Prisma CredentialPlatform.
      const platform = parsePlatform(dto.platform);
      if (!platform) {
        return contextBase;
      }

      const posts = await this.prisma.post.findMany({
        orderBy: { publicationDate: 'desc' },
        take: 100,
        where: scopedWhere(organizationId, {
          brandId: dto.brandId.toString(),
          platform,
          AND: [
            postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
            postVisibilityReadFilter(PostVisibility.PUBLIC),
          ],
          ...(dto.dateRange
            ? {
                publicationDate: {
                  gte: new Date(dto.dateRange.start),
                  lte: new Date(dto.dateRange.end),
                },
              }
            : {}),
        }),
      });

      const contextBaseId = String(contextBase.id);

      for (const post of posts) {
        const content = [post.label, post.description]
          .filter(Boolean)
          .join('\n\n');
        if (!content.trim()) continue;

        const chunks = chunkText(content);
        for (const [chunkIndex, chunk] of chunks.entries()) {
          await this.addEntry(
            contextBaseId,
            {
              content: chunk,
              metadata: {
                chunkIndex,
                platform: dto.platform,
                postId: post.id,
                publishedAt: post.publicationDate || post.scheduledDate,
                source: 'social-post',
                sourceId: post.id,
              },
            },
            organizationId,
          );
        }
      }

      return contextBase;
    } catch (error: unknown) {
      this.logger.error('Failed to auto-create context', { error });
      throw error;
    }
  }

  async getStats(
    id: string,
    organizationId: string,
  ): Promise<{
    contextBase: ContextBase;
    totalEntries: number;
    avgRelevanceWeight: number;
    mostRecentEntry?: Date;
    sources: Record<string, number>;
  }> {
    const contextBase = await this.findOne(id, organizationId);

    const entries = this.normalizeContextEntries(
      await this.prisma.contextEntry.findMany({
        where: { contextBaseId: id, isDeleted: false, organizationId },
      }),
    );

    const avgRelevanceWeight =
      entries.length > 0
        ? entries.reduce((sum, e) => sum + (e.relevanceWeight ?? 1), 0) /
          entries.length
        : 0;

    const sources: Record<string, number> = {};
    for (const e of entries) {
      const metadata = e.metadata as Record<string, unknown> | null;
      const source = (metadata?.source as string) || 'unknown';
      sources[source] = (sources[source] || 0) + 1;
    }

    return {
      avgRelevanceWeight,
      contextBase,
      sources,
      totalEntries: entries.length,
    };
  }

  private async generateEmbedding(
    text: string,
    modelIdentifier?: string,
  ): Promise<number[]> {
    const model =
      modelIdentifier ??
      (await this.routerService.getDefaultModel(ModelCategory.EMBEDDING));
    return this.replicateService.generateEmbedding(model, text);
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

    const rows = await this.prisma.contextBase.findMany({
      select: { createdById: true, data: true, id: true, sourceBrandId: true },
      where: scopedWhere(params.organizationId, buildBaseWhere(brandId)),
    });
    const bases = rows.filter((row) => isContextBaseInBrandScope(row, brandId));
    if (bases.length === 0) {
      return { bases, entries: [] };
    }

    const queryEmbedding = await this.generateEmbedding(query);
    const entries = await this.findSimilarEntries(
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

    const queryEmbedding = await this.generateEmbedding(query);
    const entries = await this.findSimilarEntries(
      params.organizationId,
      bases.map((base) => base.id),
      queryEmbedding,
      params.limit ?? 5,
      params.minRelevance ?? 0.65,
      { isKnowledgeOnly: true, knowledgeOrgAndPersonalUserId: userId },
    );
    return { bases, entries };
  }

  /** Active prompt-enhancement bases in the request brand's scope. */
  private async getRelevantContextBases(
    organizationId: string,
    dto: EnhancePromptDto,
  ): Promise<ContextBase[]> {
    const brandId = dto.brandId?.trim() || undefined;
    const rows = await this.prisma.contextBase.findMany({
      where: scopedWhere(
        organizationId,
        buildPromptContextBaseWhere(brandId, dto.contextBaseIds),
      ),
    });

    const types: string[] = [];
    if (dto.useBrandVoice) types.push('brand_voice');
    if (dto.useContentLibrary) types.push('content_library');
    if (dto.useAudience) types.push('audience');

    const filtered = rows.filter((row) => {
      const d = this.getDataRecord(row.data);
      if (!d.isActive) return false;
      if (!isContextBaseInBrandScope(row, brandId)) return false;
      if (types.length > 0 && !types.includes(d.type as string)) return false;
      return true;
    });

    return this.normalizeContextBases(filtered);
  }

  private async retrieveRelevantEntries(
    contextBases: ContextBase[],
    query: string,
    limit: number,
    organizationId: string,
  ): Promise<ContextPromptEntry[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    const contextBaseById = new Map(
      contextBases.map((contextBase) => [contextBase.id, contextBase]),
    );
    const entries = await this.findSimilarEntries(
      organizationId,
      contextBases.map((contextBase) => contextBase.id),
      queryEmbedding,
      limit,
      0.7,
    );

    return entries.map((entry) => {
      const contextBase = contextBaseById.get(entry.contextBaseId);
      return {
        content: entry.content,
        contextBaseId: entry.contextBaseId,
        ...(typeof contextBase?.type === 'string'
          ? { contextBaseType: contextBase.type }
          : {}),
        relevance: entry.similarity,
        source: contextBase?.label ?? 'context',
      };
    });
  }

  private async findSimilarEntries(
    organizationId: string,
    contextBaseIds: string[],
    queryEmbedding: number[],
    limit: number,
    minSimilarity: number,
    options: ContextSimilarityQueryOptions = {},
  ): Promise<ContextEntrySimilarityResult[]> {
    await this.rebuildMissingEntryEmbeddings(organizationId, contextBaseIds);

    const rows = await this.querySimilarEntries(
      organizationId,
      contextBaseIds,
      queryEmbedding,
      limit,
      minSimilarity,
      options,
    );

    return rows.flatMap((row) => {
      if (!row.content) {
        return [];
      }
      const citation = this.toCitation(row);
      return [
        {
          ...(citation ? { citation } : {}),
          content: row.content,
          contextBaseId: row.contextBaseId,
          ...(row.kind ? { kind: row.kind } : {}),
          ...(this.isPlainObject(row.metadata)
            ? { metadata: row.metadata }
            : {}),
          similarity: Number(row.similarity),
        },
      ];
    });
  }

  /** Citation identity travels with every Knowledge-linked passage. */
  private toCitation(
    row: ContextEntrySimilarityRow,
  ): KnowledgeRetrievalCitation | undefined {
    if (
      !row.knowledgeSourceId ||
      !row.knowledgeSourceVersionId ||
      !row.knowledgeSourceTitle ||
      !isKnowledgeSourceKind(row.knowledgeSourceKind) ||
      !isKnowledgeSourcePurpose(row.knowledgeSourcePurpose)
    ) {
      return undefined;
    }
    return {
      kind: row.knowledgeSourceKind,
      purpose: row.knowledgeSourcePurpose,
      sourceId: row.knowledgeSourceId,
      title: row.knowledgeSourceTitle,
      ...(row.knowledgeSourceUrl ? { url: row.knowledgeSourceUrl } : {}),
      version: Number(row.knowledgeSourceVersion ?? 0),
      versionId: row.knowledgeSourceVersionId,
    };
  }

  /**
   * Lazy inline backfill on the retrieval hot path (#2457).
   *
   * Empty-content rows are marked failed in SQL so they never re-enter the
   * sweep. Pending rows are claimed with FOR UPDATE SKIP LOCKED so concurrent
   * retrievals cannot duplicate provider work. Provider failures persist
   * embeddingFailedAt. A queue-based off-request backfill remains the deeper
   * follow-up for large lag.
   */
  private async rebuildMissingEntryEmbeddings(
    organizationId: string,
    contextBaseIds: string[],
  ): Promise<void> {
    if (contextBaseIds.length === 0) {
      return;
    }

    await this.prisma.$executeRaw(
      buildEmptyContentFailQuery(organizationId, contextBaseIds),
    );

    const rows = await this.prisma.$queryRaw<ContextEntryPendingEmbeddingRow[]>(
      buildPendingEmbeddingClaimQuery(organizationId, contextBaseIds),
    );

    if (rows.length === 0) {
      return;
    }

    const model = await this.routerService.getDefaultModel(
      ModelCategory.EMBEDDING,
    );
    let rebuiltCount = 0;

    for (const row of rows) {
      if (!row.content) {
        await this.prisma.$executeRaw(
          buildEmbeddingFailureQuery(row.id, organizationId),
        );
        continue;
      }

      try {
        const embedding = await this.generateEmbedding(row.content, model);
        await this.writeEntryEmbedding(row.id, organizationId, embedding);
        rebuiltCount += 1;
      } catch (error: unknown) {
        await this.prisma.$executeRaw(
          buildEmbeddingFailureQuery(row.id, organizationId),
        );
        this.logger.error('Failed to lazily re-embed context entry', {
          contextEntryId: row.id,
          error,
          organizationId,
        });
      }
    }

    if (rebuiltCount > 0) {
      this.logger.log('Lazily rebuilt context entry embeddings', {
        organizationId,
        rebuiltCount,
      });
    }
  }

  /**
   * Small-tenant HNSW recall: iterative_scan keeps scanning after the org
   * filter removes candidates. `set_config(..., is_local := true)` only lasts
   * for this transaction, so it must share a transaction with the similarity
   * query. Older pgvector without the GUC is a no-op.
   */
  private async querySimilarEntries(
    organizationId: string,
    contextBaseIds: string[],
    queryEmbedding: number[],
    limit: number,
    minSimilarity: number,
    options: ContextSimilarityQueryOptions = {},
  ): Promise<ContextEntrySimilarityRow[]> {
    return this.prisma.$transaction(async (tx) => {
      try {
        await tx.$executeRaw(
          Prisma.sql`SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)`,
        );
      } catch (error: unknown) {
        this.logger.debug('hnsw.iterative_scan unavailable', { error });
      }

      return tx.$queryRaw<ContextEntrySimilarityRow[]>(
        buildContextSimilarityQuery(
          organizationId,
          contextBaseIds,
          queryEmbedding,
          limit,
          minSimilarity,
          options,
        ),
      );
    });
  }

  private async writeEntryEmbedding(
    entryId: string,
    organizationId: string,
    embedding: number[],
  ): Promise<void> {
    const serializedEmbedding = serializeContextEmbedding(embedding);
    const updatedCount = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "context_entries"
      SET "embedding" = ${serializedEmbedding}::vector,
          "embeddingClaimedAt" = NULL
      WHERE "id" = ${entryId}
        AND "organizationId" = ${organizationId}
        AND "isDeleted" = false
    `);

    if (updatedCount !== 1) {
      throw new Error(`Context entry ${entryId} was not available for update`);
    }
  }
}
