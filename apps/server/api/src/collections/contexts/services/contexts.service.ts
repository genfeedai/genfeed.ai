import { AddEntryDto } from '@api/collections/contexts/dto/add-entry.dto';
import { AutoCreateContextDto } from '@api/collections/contexts/dto/autocreate.dto';
import { CreateContextDto } from '@api/collections/contexts/dto/create-context.dto';
import { EnhancePromptDto } from '@api/collections/contexts/dto/enhance-prompt.dto';
import { QueryContextDto } from '@api/collections/contexts/dto/query.dto';
import { UpdateContextDto } from '@api/collections/contexts/dto/update-context.dto';
import type { ContextBase } from '@api/collections/contexts/schemas/context-base.schema';
import type { ContextEntry } from '@api/collections/contexts/schemas/context-entry.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform, PublishStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

const PLATFORM_MAP: Record<string, CredentialPlatform> = {
  instagram: CredentialPlatform.INSTAGRAM,
  linkedin: CredentialPlatform.LINKEDIN,
  tiktok: CredentialPlatform.TIKTOK,
  twitter: CredentialPlatform.TWITTER,
  youtube: CredentialPlatform.YOUTUBE,
};

@Injectable()
export class ContextsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly replicateService: ReplicateService,
  ) {}

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private getDataRecord(value: unknown): Record<string, unknown> {
    return this.isPlainObject(value) ? { ...value } : {};
  }

  private normalizeContextBase(contextBase: {
    id: string;
    mongoId: string | null;
    organizationId: string;
    createdById?: string | null;
    sourceBrandId?: string | null;
    data?: unknown;
    [key: string]: unknown;
  }): ContextBase {
    return {
      ...contextBase,
      ...this.getDataRecord(contextBase.data),
      _id: contextBase.mongoId || contextBase.id,
      createdBy: contextBase.createdById ?? undefined,
      organization: contextBase.organizationId,
      sourceBrand: contextBase.sourceBrandId ?? undefined,
    } as ContextBase;
  }

  private normalizeContextBases(
    contextBases: Array<{
      id: string;
      mongoId: string | null;
      organizationId: string;
      createdById?: string | null;
      sourceBrandId?: string | null;
      data?: unknown;
      [key: string]: unknown;
    }>,
  ): ContextBase[] {
    return contextBases.map((contextBase) =>
      this.normalizeContextBase(contextBase),
    );
  }

  private normalizeContextEntry(entry: {
    id: string;
    mongoId: string | null;
    contextBaseId: string;
    organizationId: string;
    data?: unknown;
    [key: string]: unknown;
  }): ContextEntry {
    return {
      ...entry,
      ...this.getDataRecord(entry.data),
      _id: entry.mongoId || entry.id,
      contextBase: entry.contextBaseId,
      organization: entry.organizationId,
    } as ContextEntry;
  }

  private normalizeContextEntries(
    entries: Array<{
      id: string;
      mongoId: string | null;
      contextBaseId: string;
      organizationId: string;
      data?: unknown;
      [key: string]: unknown;
    }>,
  ): ContextEntry[] {
    return entries.map((entry) => this.normalizeContextEntry(entry));
  }

  private async adjustContextBaseMetric(
    contextBaseId: string,
    metric: 'entryCount' | 'usageCount',
    delta: number,
  ): Promise<void> {
    const existing = await this.prisma.contextBase.findUnique({
      where: { id: contextBaseId },
    });

    if (!existing) {
      return;
    }

    const data = this.getDataRecord(existing.data);
    const currentValue = typeof data[metric] === 'number' ? data[metric] : 0;

    await this.prisma.contextBase.update({
      data: {
        data: {
          ...data,
          [metric]: Math.max(0, Number(currentValue) + delta),
        } as never,
      },
      where: { id: contextBaseId },
    });
  }

  private async updateContextEntryData(
    entryId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.prisma.contextEntry.findUnique({
      where: { id: entryId },
    });

    if (!existing) {
      return;
    }

    await this.prisma.contextEntry.update({
      data: {
        data: {
          ...this.getDataRecord(existing.data),
          ...patch,
        } as never,
      },
      where: { id: entryId },
    });
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
    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
    };

    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters?.search) {
      where.label = { contains: filters.search, mode: 'insensitive' };
    }

    return this.normalizeContextBases(
      await this.prisma.contextBase.findMany({
        orderBy: { createdAt: 'desc' },
        where,
      }),
    );
  }

  async findOne(id: string, organizationId: string): Promise<ContextBase> {
    const contextBase = await this.prisma.contextBase.findFirst({
      where: {
        id,
        isDeleted: false,
        organizationId,
      },
    });

    if (!contextBase) {
      throw new NotFoundException('Context base not found');
    }

    return this.normalizeContextBase(contextBase);
  }

  async update(
    id: string,
    dto: UpdateContextDto,
    organizationId: string,
  ): Promise<ContextBase> {
    const existing = await this.prisma.contextBase.findFirst({
      where: { id, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Context base not found');
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
    const existing = await this.prisma.contextBase.findFirst({
      where: { id, isDeleted: false, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Context base not found');
    }

    await this.prisma.contextBase.update({
      data: { isDeleted: true },
      where: { id },
    });

    await this.prisma.contextEntry.updateMany({
      data: { isDeleted: true },
      where: { contextBaseId: id, isDeleted: false },
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

      const entry = await this.prisma.contextEntry.create({
        data: {
          contextBaseId,
          data: {
            content: dto.content,
            embedding,
            metadata: dto.metadata as Record<string, unknown>,
            relevanceWeight: dto.relevanceWeight || 1.0,
          } as never,
          organizationId,
        },
      });

      await this.adjustContextBaseMetric(contextBaseId, 'entryCount', 1);

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
    const existing = await this.prisma.contextEntry.findFirst({
      where: {
        contextBaseId,
        id: entryId,
        isDeleted: false,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Entry not found');
    }

    await this.prisma.contextEntry.update({
      data: { isDeleted: true },
      where: { id: entryId },
    });

    await this.adjustContextBaseMetric(contextBaseId, 'entryCount', -1);
  }

  async enhancePrompt(
    dto: EnhancePromptDto,
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    originalPrompt: string;
    enhancedPrompt: string;
    context: Array<{ content: string; source: string; relevance: number }>;
    estimatedQualityBoost: number;
  }> {
    try {
      this.logger.debug('Enhancing prompt with RAG', {
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
      );

      if (relevantEntries.length === 0) {
        return {
          context: [],
          enhancedPrompt: dto.prompt,
          estimatedQualityBoost: 0,
          originalPrompt: dto.prompt,
        };
      }

      const contextString = this.buildContextString(relevantEntries);
      const enhancedPrompt = await this.performRAGEnhancement(
        dto.prompt,
        dto.contentType,
        contextString,
        onBilling,
      );

      for (const base of contextBases) {
        const baseId = String(
          (base as Record<string, unknown>).id ??
            (base as Record<string, unknown>)._id,
        );
        await this.adjustContextBaseMetric(baseId, 'usageCount', 1);
      }

      const avgRelevance =
        relevantEntries.reduce((sum, e) => sum + e.relevance, 0) /
        relevantEntries.length;

      return {
        context: relevantEntries.map((e) => ({
          content: e.content,
          relevance: e.relevance,
          source: e.source,
        })),
        enhancedPrompt,
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
        dto.contextBaseId,
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

      const credentialPlatform = PLATFORM_MAP[dto.platform];
      if (!credentialPlatform) {
        return contextBase;
      }

      const posts = await this.prisma.post.findMany({
        orderBy: { publicationDate: 'desc' },
        take: 100,
        where: {
          brandId: dto.brandId.toString(),
          isDeleted: false,
          organizationId,
          platform: credentialPlatform as never,
          publishStatus: PublishStatus.PUBLISHED,
          ...(dto.dateRange
            ? {
                publicationDate: {
                  gte: new Date(dto.dateRange.start),
                  lte: new Date(dto.dateRange.end),
                },
              }
            : {}),
        },
      });

      const contextBaseId = String(
        (contextBase as Record<string, unknown>).id ??
          (contextBase as Record<string, unknown>)._id,
      );

      for (const post of posts) {
        const content = [post.label, post.description]
          .filter(Boolean)
          .join('\n\n');
        if (!content.trim()) continue;

        await this.prisma.contextEntry.create({
          data: {
            contextBaseId,
            data: {
              content,
              metadata: {
                platform: dto.platform,
                postId: post.id,
                publishedAt: post.publicationDate || post.scheduledDate,
                source: 'social-post',
                sourceId: post.id,
              },
              relevanceWeight: 1,
            },
            isDeleted: false,
            organizationId,
          },
        });
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
        where: { contextBaseId: id, isDeleted: false },
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

  private generateEmbedding(text: string): Promise<number[]> {
    return this.replicateService.generateEmbedding(text);
  }

  private async getRelevantContextBases(
    organizationId: string,
    dto: EnhancePromptDto,
  ): Promise<ContextBase[]> {
    const where: Record<string, unknown> = {
      isActive: true,
      isDeleted: false,
      organizationId,
    };

    if (dto.contextBaseIds?.length) {
      where.id = { in: dto.contextBaseIds };
      return this.normalizeContextBases(
        await this.prisma.contextBase.findMany({
          where,
        }),
      );
    }

    const types: string[] = [];
    if (dto.useBrandVoice) types.push('brand_voice');
    if (dto.useContentLibrary) types.push('content_library');
    if (dto.useAudience) types.push('audience');

    if (types.length > 0) {
      where.type = { in: types };
    }

    return this.normalizeContextBases(
      await this.prisma.contextBase.findMany({
        where,
      }),
    );
  }

  private async retrieveRelevantEntries(
    contextBases: ContextBase[],
    query: string,
    limit: number,
  ): Promise<Array<{ content: string; source: string; relevance: number }>> {
    const queryEmbedding = await this.generateEmbedding(query);
    const allEntries: Array<{
      content: string;
      source: string;
      relevance: number;
    }> = [];

    for (const contextBase of contextBases) {
      const contextBaseId = String(
        (contextBase as Record<string, unknown>).id ??
          (contextBase as Record<string, unknown>)._id,
      );
      const entries = await this.findSimilarEntries(
        contextBaseId,
        queryEmbedding,
        limit,
        0.7,
      );

      for (const e of entries) {
        allEntries.push({
          content: e.content,
          relevance: e.similarity,
          source: contextBase.label ?? 'context',
        });
      }
    }

    return allEntries.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  }

  private async findSimilarEntries(
    contextBaseId: string,
    queryEmbedding: number[],
    limit: number,
    minSimilarity: number,
  ): Promise<
    Array<{
      content: string;
      similarity: number;
      metadata?: Record<string, unknown>;
    }>
  > {
    const entries = this.normalizeContextEntries(
      await this.prisma.contextEntry.findMany({
        where: { contextBaseId, isDeleted: false },
      }),
    );

    const preparedEntries: Array<{
      content: string;
      embedding: number[];
      metadata?: Record<string, unknown>;
    }> = [];

    const mismatchedDimensions = new Set<number>();
    let reembeddedCount = 0;

    for (const entry of entries) {
      const rawEmbedding = entry.embedding as unknown as number[];
      if (!rawEmbedding || rawEmbedding.length === 0) continue;

      let embedding = rawEmbedding;

      if (embedding.length !== queryEmbedding.length) {
        mismatchedDimensions.add(embedding.length);
        try {
          embedding = await this.rebuildEntryEmbedding(
            entry.id,
            entry.content ?? '',
          );
          reembeddedCount += 1;
        } catch (error: unknown) {
          this.logger.error('Failed to re-embed context entry', {
            contextBaseId,
            contextEntryId: entry.id,
            error,
          });
        }

        if (embedding.length !== queryEmbedding.length) continue;
      }

      preparedEntries.push({
        content: entry.content ?? '',
        embedding,
        metadata: entry.metadata as Record<string, unknown> | undefined,
      });
    }

    if (reembeddedCount > 0 || mismatchedDimensions.size > 0) {
      this.logger.warn('Realigned context entry embeddings for similarity', {
        contextBaseId,
        mismatchedDimensions: Array.from(mismatchedDimensions),
        reembeddedCount,
        targetDimensions: queryEmbedding.length,
      });
    }

    return preparedEntries
      .map((entry) => ({
        content: entry.content,
        metadata: entry.metadata,
        similarity: this.cosineSimilarity(queryEmbedding, entry.embedding),
      }))
      .filter((r) => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  private async rebuildEntryEmbedding(
    entryId: string,
    content: string,
  ): Promise<number[]> {
    const embedding = await this.generateEmbedding(content);
    await this.updateContextEntryData(entryId, { embedding });
    return embedding;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const length = Math.min(a.length, b.length);
    if (length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private buildContextString(
    entries: Array<{ content: string; source: string; relevance: number }>,
  ): string {
    return entries
      .map(
        (e, i) =>
          `[${i + 1}] From ${e.source} (${Math.round(e.relevance * 100)}% relevant):\n${e.content}`,
      )
      .join('\n\n');
  }

  private async performRAGEnhancement(
    prompt: string,
    contentType: string,
    context: string,
    onBilling?: (amount: number) => void,
  ): Promise<string> {
    const enhancePrompt = `You are enhancing a ${contentType} generation prompt using RAG (Retrieval Augmented Generation).

Original prompt: "${prompt}"

Relevant context from the knowledge base:
${context}

Using this context, enhance the original prompt to:
1. Incorporate brand voice and style from the context
2. Use successful patterns from past content
3. Align with audience preferences
4. Maintain the original intent

Return ONLY the enhanced prompt, no explanation.`;

    const input = { max_completion_tokens: 2048, prompt: enhancePrompt };
    const result = await this.replicateService.generateTextCompletionSync(
      DEFAULT_TEXT_MODEL,
      input,
    );
    onBilling?.(await this.calculateDefaultTextCharge(input, result));
    return result || prompt;
  }

  private async calculateDefaultTextCharge(
    input: Record<string, unknown>,
    output: string,
  ): Promise<number> {
    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      throw new Error(
        `Model pricing is not configured for ${DEFAULT_TEXT_MODEL}`,
      );
    }

    return calculateEstimatedTextCredits(model, input, output);
  }
}
