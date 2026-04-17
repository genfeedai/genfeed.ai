import { AddEntryDto } from '@api/collections/contexts/dto/add-entry.dto';
import { AutoCreateContextDto } from '@api/collections/contexts/dto/autocreate.dto';
import { CreateContextDto } from '@api/collections/contexts/dto/create-context.dto';
import { EnhancePromptDto } from '@api/collections/contexts/dto/enhance-prompt.dto';
import { QueryContextDto } from '@api/collections/contexts/dto/query.dto';
import { UpdateContextDto } from '@api/collections/contexts/dto/update-context.dto';
import {
  ContextBase,
  type ContextBaseDocument,
} from '@api/collections/contexts/schemas/context-base.schema';
import {
  ContextEntry,
  type ContextEntryDocument,
} from '@api/collections/contexts/schemas/context-entry.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform, PublishStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

/** Map autocreate platform string to CredentialPlatform enum */
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
    @InjectModel(ContextBase.name, DB_CONNECTIONS.CLOUD)
    private contextBaseModel: Model<ContextBaseDocument>,
    @InjectModel(ContextEntry.name, DB_CONNECTIONS.CLOUD)
    private contextEntryModel: Model<ContextEntryDocument>,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly replicateService: ReplicateService,
  ) {}

  /**
   * Create a new context base
   */
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

    const contextBase = new this.contextBaseModel({
      ...dto,
      category: dto.type,
      createdBy: userId,
      organization: organizationId,
    });

    await contextBase.save();

    this.logger.debug('Context base created', {
      contextBaseId: contextBase._id,
    });

    return contextBase.toObject();
  }

  /**
   * Find all context bases
   */
  async findAll(
    organizationId: string,
    filters?: {
      category?: string;
      isActive?: boolean;
      search?: string;
    },
  ): Promise<ContextBase[]> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: organizationId,
    };

    if (filters?.category) {
      query.category = filters.category;
    }

    if (filters?.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    if (filters?.search) {
      query.$text = { $search: filters.search };
    }

    return await this.contextBaseModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Find one context base
   */
  async findOne(id: string, organizationId: string): Promise<ContextBase> {
    const contextBase = await this.contextBaseModel
      .findOne({
        _id: id,
        isDeleted: false,
        organization: organizationId,
      })
      .lean();

    if (!contextBase) {
      throw new NotFoundException('Context base not found');
    }

    return contextBase;
  }

  /**
   * Update context base
   */
  async update(
    id: string,
    dto: UpdateContextDto,
    organizationId: string,
  ): Promise<ContextBase> {
    const contextBase = await this.contextBaseModel.findOneAndUpdate(
      { _id: id, isDeleted: false, organization: organizationId },
      { $set: dto },
      { returnDocument: 'after' },
    );

    if (!contextBase) {
      throw new NotFoundException('Context base not found');
    }

    return contextBase.toObject();
  }

  /**
   * Delete context base (soft delete)
   */
  async remove(id: string, organizationId: string): Promise<void> {
    const result = await this.contextBaseModel.updateOne(
      { _id: id, isDeleted: false, organization: organizationId },
      { $set: { isDeleted: true } },
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException('Context base not found');
    }

    // Also soft delete all entries
    await this.contextEntryModel.updateMany(
      { contextBaseId: id, isDeleted: false },
      { $set: { isDeleted: true } },
    );
  }

  /**
   * Add entry to context base
   */
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

      // Verify context base exists
      await this.findOne(contextBaseId, organizationId);

      // Generate embedding for content
      const embedding = await this.generateEmbedding(dto.content);

      // Create entry
      const entry = new this.contextEntryModel({
        content: dto.content,
        contextBase: contextBaseId,
        embedding,
        metadata: dto.metadata,
        organization: organizationId,
        relevanceWeight: dto.relevanceWeight || 1.0,
      });

      await entry.save();

      // Update entry count
      await this.contextBaseModel.updateOne(
        { _id: contextBaseId },
        { $inc: { entryCount: 1 } },
      );

      this.logger.debug('Entry added', { entryId: entry._id });

      return entry.toObject();
    } catch (error: unknown) {
      this.logger.error('Failed to add entry', { error });
      throw error;
    }
  }

  /**
   * Remove entry from context base
   */
  async removeEntry(
    contextBaseId: string,
    entryId: string,
    organizationId: string,
  ): Promise<void> {
    const result = await this.contextEntryModel.updateOne(
      {
        _id: entryId,
        contextBase: contextBaseId,
        isDeleted: false,
        organization: organizationId,
      },
      { $set: { isDeleted: true } },
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException('Entry not found');
    }

    // Update entry count
    await this.contextBaseModel.updateOne(
      { _id: contextBaseId },
      { $inc: { entryCount: -1 } },
    );
  }

  /**
   * Enhance prompt with RAG context
   */
  async enhancePrompt(
    dto: EnhancePromptDto,
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    originalPrompt: string;
    enhancedPrompt: string;
    context: Array<{
      content: string;
      source: string;
      relevance: number;
    }>;
    estimatedQualityBoost: number;
  }> {
    try {
      this.logger.debug('Enhancing prompt with RAG', {
        contentType: dto.contentType,
        organizationId,
      });

      // Get relevant context bases
      const contextBases = await this.getRelevantContextBases(
        organizationId,
        dto,
      );

      if (contextBases.length === 0) {
        this.logger.debug('No context bases found, returning original prompt');
        return {
          context: [],
          enhancedPrompt: dto.prompt,
          estimatedQualityBoost: 0,
          originalPrompt: dto.prompt,
        };
      }

      // Retrieve relevant entries from all context bases
      const relevantEntries = await this.retrieveRelevantEntries(
        contextBases,
        dto.prompt,
        dto.maxResults || 5,
      );

      if (relevantEntries.length === 0) {
        this.logger.debug('No relevant entries found');
        return {
          context: [],
          enhancedPrompt: dto.prompt,
          estimatedQualityBoost: 0,
          originalPrompt: dto.prompt,
        };
      }

      // Build context string
      const contextString = this.buildContextString(relevantEntries);

      // Enhance prompt with AI
      const enhancedPrompt = await this.performRAGEnhancement(
        dto.prompt,
        dto.contentType,
        contextString,
        onBilling,
      );

      // Track usage
      for (const base of contextBases) {
        const baseId = String((base as { _id: string | Types.ObjectId })._id);
        await this.contextBaseModel.updateOne(
          { _id: baseId },
          { $inc: { usageCount: 1 } },
        );
      }

      // Estimate quality boost based on relevance scores
      const avgRelevance =
        relevantEntries.reduce((sum, e) => sum + e.relevance, 0) /
        relevantEntries.length;
      const qualityBoost = Math.round(avgRelevance * 50); // 0-50% boost

      return {
        context: relevantEntries.map((e) => ({
          content: e.content,
          relevance: e.relevance,
          source: e.source,
        })),
        enhancedPrompt,
        estimatedQualityBoost: qualityBoost,
        originalPrompt: dto.prompt,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to enhance prompt', { error });
      throw error;
    }
  }

  /**
   * Query context base for relevant entries
   */
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
      this.logger.debug('Querying context base', {
        contextBaseId: dto.contextBaseId,
        organizationId,
      });

      // Verify context base exists
      await this.findOne(dto.contextBaseId, organizationId);

      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(dto.query);

      // Find similar entries
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

  /**
   * Auto-create context from social brand
   */
  async autoCreateFromAccount(
    dto: AutoCreateContextDto,
    organizationId: string,
    userId?: string,
  ): Promise<ContextBase> {
    try {
      this.logger.debug('Auto-creating context from brand', {
        brandId: dto.brandId,
        organizationId,
        platform: dto.platform,
      });

      // Create context base
      const contextBase = await this.create(
        {
          description: dto.description,
          label: dto.label,
          source: 'auto-generated',
          sourceBrand: dto.brandId?.toString(),
          sourceUrl: undefined, // Could be set from platform URL
          type: 'content_library',
        },
        organizationId,
        userId,
      );

      // Fetch published posts for this brand/platform from the posts collection
      const credentialPlatform = PLATFORM_MAP[dto.platform];
      if (!credentialPlatform) {
        this.logger.warn('Unsupported platform for auto-create', {
          platform: dto.platform,
        });
        return contextBase;
      }

      const posts = await this.prisma.post.findMany({
        orderBy: { publicationDate: 'desc' },
        take: 100,
        where: {
          brandId: dto.brandId.toString(),
          isDeleted: false,
          organizationId,
          platform: credentialPlatform,
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

      this.logger.debug('Found posts for context auto-create', {
        brandId: dto.brandId,
        count: posts.length,
        platform: dto.platform,
      });

      // Add each post as a context entry
      for (const post of posts) {
        const content = [post.label, post.description]
          .filter(Boolean)
          .join('\n\n');

        if (!content.trim()) {
          continue;
        }

        const entry = new this.contextEntryModel({
          content,
          contextBase: contextBase._id,
          isDeleted: false,
          metadata: {
            platform: dto.platform,
            postId: post.id,
            publishedAt: post.publicationDate || post.scheduledDate,
            source: 'social-post',
            sourceId: post.id,
          },
          organization: organizationId,
          relevanceWeight: 1,
        });

        await entry.save();
      }

      this.logger.debug('Context auto-create completed', {
        contextBaseId: contextBase._id,
        entriesAdded: posts.length,
      });

      return contextBase;
    } catch (error: unknown) {
      this.logger.error('Failed to auto-create context', { error });
      throw error;
    }
  }

  /**
   * Get context base stats
   */
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

    const entries = await this.contextEntryModel
      .find({
        contextBase: id,
        isDeleted: false,
      })
      .lean();

    const avgRelevanceWeight =
      entries.length > 0
        ? entries.reduce((sum, e) => sum + e.relevanceWeight, 0) /
          entries.length
        : 0;

    const sources: Record<string, number> = {};
    entries.forEach((e) => {
      const source = e.metadata?.source || 'unknown';
      sources[source] = (sources[source] || 0) + 1;
    });

    return {
      avgRelevanceWeight,
      contextBase,
      sources,
      totalEntries: entries.length,
    };
  }

  /**
   * Private: Generate embedding for text using CLIP via Replicate
   */
  private generateEmbedding(text: string): Promise<number[]> {
    return this.replicateService.generateEmbedding(text);
  }

  /**
   * Private: Get relevant context bases
   */
  private async getRelevantContextBases(
    organizationId: string,
    dto: EnhancePromptDto,
  ): Promise<ContextBase[]> {
    const query: Record<string, unknown> = {
      isActive: true,
      isDeleted: false,
      organization: organizationId,
    };

    // If specific context bases requested
    if (dto.contextBaseIds?.length) {
      query._id = { $in: dto.contextBaseIds };
      return await this.contextBaseModel.find(query).lean();
    }

    // Otherwise, use type filters
    const types: string[] = [];

    if (dto.useBrandVoice) {
      types.push('brand_voice');
    }
    if (dto.useContentLibrary) {
      types.push('content_library');
    }
    if (dto.useAudience) {
      types.push('audience');
    }

    if (types.length > 0) {
      query.type = { $in: types };
    }

    return await this.contextBaseModel.find(query).lean();
  }

  /**
   * Private: Retrieve relevant entries
   */
  private async retrieveRelevantEntries(
    contextBases: ContextBase[],
    query: string,
    limit: number,
  ): Promise<
    Array<{
      content: string;
      source: string;
      relevance: number;
    }>
  > {
    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    const allEntries: Array<{
      content: string;
      source: string;
      relevance: number;
    }> = [];

    // Search in each context base
    for (const contextBase of contextBases) {
      const contextBaseId = String(
        (contextBase as { _id: string | Types.ObjectId })._id,
      );
      const entries = await this.findSimilarEntries(
        contextBaseId,
        queryEmbedding,
        limit,
        0.7,
      );

      entries.forEach((e) => {
        allEntries.push({
          content: e.content,
          relevance: e.similarity,
          source: contextBase.label,
        });
      });
    }

    // Sort by relevance and limit
    return allEntries.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  }

  /**
   * Private: Find similar entries using cosine similarity
   */
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
    // Get all entries (in production, use vector search index)
    const entries = await this.contextEntryModel
      .find({
        contextBase: contextBaseId,
        embedding: { $exists: true },
        isDeleted: false,
      })
      .lean();

    const preparedEntries: Array<{
      content: string;
      embedding: number[];
      metadata?: Record<string, unknown>;
    }> = [];

    const mismatchedDimensions = new Set<number>();
    let reembeddedCount = 0;

    for (const entry of entries) {
      if (!entry.embedding || entry.embedding.length === 0) {
        continue;
      }

      let embedding = entry.embedding;

      if (embedding.length !== queryEmbedding.length) {
        mismatchedDimensions.add(embedding.length);

        try {
          embedding = await this.rebuildEntryEmbedding(
            String(entry._id),
            entry.content,
          );
          reembeddedCount += 1;
        } catch (error: unknown) {
          this.logger.error('Failed to re-embed context entry', {
            contextBaseId,
            contextEntryId: String(entry._id),
            error,
          });
        }

        if (embedding.length !== queryEmbedding.length) {
          this.logger.warn(
            'Skipping context entry with incompatible embedding dimensions',
            {
              contextBaseId,
              contextEntryId: String(entry._id),
              entryDimensions: embedding.length,
              targetDimensions: queryEmbedding.length,
            },
          );
          continue;
        }
      }

      preparedEntries.push({
        content: entry.content,
        embedding,
        metadata: entry.metadata,
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

    // Calculate cosine similarity for each entry
    const results = preparedEntries
      .map((entry) => {
        const similarity = this.cosineSimilarity(
          queryEmbedding,
          entry.embedding,
        );
        return {
          content: entry.content,
          metadata: entry.metadata,
          similarity,
        };
      })
      .filter((r) => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return results;
  }

  /**
   * Private: Rebuild embeddings to match current dimensions.
   */
  private async rebuildEntryEmbedding(
    entryId: string,
    content: string,
  ): Promise<number[]> {
    const embedding = await this.generateEmbedding(content);

    await this.contextEntryModel.updateOne(
      { _id: entryId },
      { $set: { embedding } },
    );

    return embedding;
  }

  /**
   * Private: Calculate cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const length = Math.min(a.length, b.length);

    if (length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Private: Build context string from entries
   */
  private buildContextString(
    entries: Array<{
      content: string;
      source: string;
      relevance: number;
    }>,
  ): string {
    return entries
      .map(
        (e, i) =>
          `[${i + 1}] From ${e.source} (${Math.round(e.relevance * 100)}% relevant):\n${e.content}`,
      )
      .join('\n\n');
  }

  /**
   * Private: Perform RAG enhancement using Replicate GPT-5.2
   */
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

    const input = {
      max_completion_tokens: 2048,
      prompt: enhancePrompt,
    };
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
