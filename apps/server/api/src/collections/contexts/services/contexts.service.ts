import { AddEntryDto } from '@api/collections/contexts/dto/add-entry.dto';
import { AutoCreateContextDto } from '@api/collections/contexts/dto/autocreate.dto';
import { CreateContextDto } from '@api/collections/contexts/dto/create-context.dto';
import { EnhancePromptDto } from '@api/collections/contexts/dto/enhance-prompt.dto';
import { QueryContextDto } from '@api/collections/contexts/dto/query.dto';
import { UpdateContextDto } from '@api/collections/contexts/dto/update-context.dto';
import type { ContextBase } from '@api/collections/contexts/schemas/context-base.schema';
import type {
  ContextEntry,
  ContextEntryPendingEmbeddingRow,
  ContextEntrySimilarityResult,
  ContextEntrySimilarityRow,
} from '@api/collections/contexts/schemas/context-entry.schema';
import {
  buildEmbeddingFailureQuery,
  buildEmptyContentFailQuery,
  buildPendingEmbeddingClaimQuery,
} from '@api/collections/contexts/utils/context-embedding-claim-query.util';
import {
  buildContextSimilarityQuery,
  serializeContextEmbedding,
} from '@api/collections/contexts/utils/context-similarity-query.util';
import { chunkText } from '@api/collections/contexts/utils/text-chunker.util';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { scopedWhere } from '@api/index';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { RouterService } from '@api/services/router/router.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import {
  ModelCategory,
  PostVisibility,
  parsePlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  postExecutionStateReadFilter,
  postVisibilityReadFilter,
} from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
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

  /**
   * Soft-delete every live chunk for a knowledge source and keep the
   * context-base entryCount in sync. Used on re-ingest and source delete.
   */
  async removeEntriesBySource(
    contextBaseId: string,
    sourceId: string,
    organizationId: string,
  ): Promise<number> {
    const result = await this.prisma.contextEntry.updateMany({
      data: { isDeleted: true },
      where: scopedWhere(organizationId, {
        contextBaseId,
        data: {
          equals: sourceId,
          path: ['metadata', 'sourceId'],
        },
      }),
    });

    if (result.count > 0) {
      await this.adjustContextBaseMetric(
        contextBaseId,
        organizationId,
        'entryCount',
        -result.count,
      );
    }

    return result.count;
  }

  async enhancePrompt(
    dto: EnhancePromptDto,
    organizationId: string,
  ): Promise<{
    originalPrompt: string;
    enhancedPrompt: string;
    context: Array<{ content: string; source: string; relevance: number }>;
    estimatedQualityBoost: number;
  }> {
    try {
      this.logger.debug('Retrieving prompt context', {
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
        context: relevantEntries.map((e) => ({
          content: e.content,
          relevance: e.relevance,
          source: e.source,
        })),
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
  async retrieveBrandContentMemory(params: {
    brandId: string;
    limit?: number;
    minRelevance?: number;
    organizationId: string;
    query: string;
  }): Promise<
    Array<{
      content: string;
      kind?: string;
      metadata?: Record<string, unknown>;
      relevance: number;
      source?: string;
    }>
  > {
    const query = params.query.trim();
    if (!query) {
      return [];
    }

    const bases = await this.prisma.contextBase.findMany({
      select: { data: true, id: true, sourceBrandId: true },
      where: scopedWhere(params.organizationId, {
        OR: [
          { sourceBrandId: params.brandId },
          { data: { equals: params.brandId, path: ['brandId'] } },
        ],
      }),
    });

    if (bases.length === 0) {
      return [];
    }

    const queryEmbedding = await this.generateEmbedding(query);
    const entries = await this.findSimilarEntries(
      params.organizationId,
      bases.map((base) => base.id),
      queryEmbedding,
      params.limit ?? 5,
      params.minRelevance ?? 0.65,
    );

    const labelByBase = new Map(
      bases.map((base) => {
        const data =
          base.data &&
          typeof base.data === 'object' &&
          !Array.isArray(base.data)
            ? (base.data as Record<string, unknown>)
            : {};
        const purpose =
          typeof data.purpose === 'string' ? data.purpose : undefined;
        const label =
          typeof data.label === 'string' ? data.label : (purpose ?? 'context');
        return [base.id, label] as const;
      }),
    );

    return entries.map((entry) => {
      const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
      const kind =
        entry.kind ||
        (typeof metadata.kind === 'string' ? metadata.kind : undefined);
      return {
        content: entry.content,
        kind,
        metadata,
        relevance: entry.similarity,
        source: labelByBase.get(entry.contextBaseId),
      };
    });
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

  private async getRelevantContextBases(
    organizationId: string,
    dto: EnhancePromptDto,
  ): Promise<ContextBase[]> {
    const baseWhere: Record<string, unknown> = scopedWhere(organizationId, {});

    if (dto.contextBaseIds?.length) {
      baseWhere.id = { in: dto.contextBaseIds };
    }

    const rows = await this.prisma.contextBase.findMany({
      where: baseWhere,
    });

    const types: string[] = [];
    if (dto.useBrandVoice) types.push('brand_voice');
    if (dto.useContentLibrary) types.push('content_library');
    if (dto.useAudience) types.push('audience');

    const filtered = rows.filter((row) => {
      const d = (row.data as Record<string, unknown>) ?? {};
      if (!d.isActive) return false;
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
  ): Promise<Array<{ content: string; source: string; relevance: number }>> {
    const queryEmbedding = await this.generateEmbedding(query);
    const sourceByContextBaseId = new Map(
      contextBases.map((contextBase) => [
        contextBase.id,
        contextBase.label ?? 'context',
      ]),
    );
    const entries = await this.findSimilarEntries(
      organizationId,
      contextBases.map((contextBase) => contextBase.id),
      queryEmbedding,
      limit,
      0.7,
    );

    return entries.map((entry) => ({
      content: entry.content,
      relevance: entry.similarity,
      source: sourceByContextBaseId.get(entry.contextBaseId) ?? 'context',
    }));
  }

  private async findSimilarEntries(
    organizationId: string,
    contextBaseIds: string[],
    queryEmbedding: number[],
    limit: number,
    minSimilarity: number,
  ): Promise<ContextEntrySimilarityResult[]> {
    await this.rebuildMissingEntryEmbeddings(organizationId, contextBaseIds);

    const rows = await this.querySimilarEntries(
      organizationId,
      contextBaseIds,
      queryEmbedding,
      limit,
      minSimilarity,
    );

    return rows.flatMap((row) =>
      row.content
        ? [
            {
              content: row.content,
              contextBaseId: row.contextBaseId,
              ...(row.kind ? { kind: row.kind } : {}),
              ...(this.isPlainObject(row.metadata)
                ? { metadata: row.metadata }
                : {}),
              similarity: Number(row.similarity),
            },
          ]
        : [],
    );
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
