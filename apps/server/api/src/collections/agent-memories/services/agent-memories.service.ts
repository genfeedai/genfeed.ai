import {
  AGENT_MEMORY_CONTENT_TYPES,
  AGENT_MEMORY_KINDS,
  AGENT_MEMORY_SCOPES,
  type AgentMemoryContentType,
  type AgentMemoryDocument,
  type AgentMemoryKind,
  type AgentMemoryScope,
} from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

interface CreateAgentMemoryPayload {
  campaignId?: string;
  content: string;
  summary?: string;
  tags?: string[];
  sourceMessageId?: string;
  kind?: AgentMemoryKind;
  scope?: AgentMemoryScope;
  contentType?: AgentMemoryContentType;
  brandId?: string;
  platform?: string;
  sourceType?: string;
  sourceUrl?: string;
  sourceContentId?: string;
  importance?: number;
  confidence?: number;
  performanceSnapshot?: Record<string, unknown>;
}

interface MemoryQueryOptions {
  campaignId?: string;
  query?: string;
  contentType?: string;
  brandId?: string;
  pinnedMemoryIds?: string[];
  limit?: number;
}

@Injectable()
export class AgentMemoriesService extends BaseService<AgentMemoryDocument> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'agentMemory', logger);
  }

  async listForUser(
    userId: string,
    organizationId: string,
    options: { limit?: number } = {},
  ): Promise<AgentMemoryDocument[]> {
    const { limit = 100 } = options;
    return this.delegate.findMany({
      where: {
        organizationId,
        scope: { not: 'campaign' },
        userId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }) as Promise<AgentMemoryDocument[]>;
  }

  async createMemory(
    userId: string,
    organizationId: string,
    payload: CreateAgentMemoryPayload,
  ): Promise<AgentMemoryDocument> {
    const scope = this.normalizeScope(payload.scope);
    const campaignId =
      scope === 'campaign'
        ? this.requireCampaignId(payload.campaignId)
        : undefined;

    return this.create({
      brandId: payload.brandId,
      campaignId,
      confidence: this.normalizeScore(payload.confidence, 0.5),
      content: payload.content,
      contentType: this.normalizeContentType(payload.contentType),
      importance: this.normalizeScore(payload.importance, 0.5),
      kind: this.normalizeKind(payload.kind),
      organizationId,
      performanceSnapshot: payload.performanceSnapshot,
      platform: payload.platform,
      scope,
      sourceContentId: payload.sourceContentId,
      sourceMessageId: payload.sourceMessageId,
      sourceType: payload.sourceType,
      sourceUrl: payload.sourceUrl,
      summary: payload.summary,
      tags: payload.tags ?? [],
      userId,
    } as Record<string, unknown>);
  }

  async getCampaignMemories(
    campaignId: string,
    organizationId: string,
    contentType?: AgentMemoryContentType,
  ): Promise<AgentMemoryDocument[]> {
    const validatedCampaignId = this.requireCampaignId(campaignId);

    const filter: Record<string, unknown> = {
      campaignId: validatedCampaignId,
      organizationId,
      scope: 'campaign',
    };

    const normalizedContentType =
      this.normalizeOptionalContentType(contentType);
    if (normalizedContentType) {
      filter.contentType = normalizedContentType;
    }

    return this.delegate.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' },
      take: 100,
    }) as Promise<AgentMemoryDocument[]>;
  }

  async saveCampaignMemory(
    userId: string,
    organizationId: string,
    campaignId: string,
    payload: Omit<CreateAgentMemoryPayload, 'campaignId' | 'scope'>,
  ): Promise<AgentMemoryDocument> {
    return await this.createMemory(userId, organizationId, {
      ...payload,
      campaignId,
      scope: 'campaign',
    });
  }

  async getMemoriesForPrompt(
    userId: string,
    organizationId: string,
    options: MemoryQueryOptions = {},
  ): Promise<AgentMemoryDocument[]> {
    const [userMemories, campaignMemories] = await Promise.all([
      this.listForUser(userId, organizationId, {
        limit: 200,
      }),
      options.campaignId
        ? this.getCampaignMemories(
            options.campaignId,
            organizationId,
            this.normalizeOptionalContentType(options.contentType),
          )
        : Promise.resolve([]),
    ]);
    const allMemories = [...userMemories, ...campaignMemories];
    const pinnedMemoryIds = new Set(options.pinnedMemoryIds ?? []);
    const normalizedQuery = options.query?.toLowerCase() ?? '';
    const queryTerms = new Set(
      normalizedQuery
        .split(/[^a-z0-9]+/i)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3),
    );
    const requestedType = this.normalizeContentType(options.contentType);
    const requestedBrandId = options.brandId;
    const scored = allMemories
      .map((memory) => ({
        memory,
        score: this.scoreMemory(memory, {
          pinnedMemoryIds,
          queryTerms,
          requestedBrandId,
          requestedType,
        }),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        const leftTime = new Date(
          (left.memory as AgentMemoryDocument & { createdAt?: Date })
            .createdAt ?? 0,
        ).getTime();
        const rightTime = new Date(
          (right.memory as AgentMemoryDocument & { createdAt?: Date })
            .createdAt ?? 0,
        ).getTime();
        return rightTime - leftTime;
      })
      .slice(0, options.limit ?? 8)
      .map((entry) => entry.memory);

    return scored;
  }

  async removeMemory(
    memoryId: string,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const memory = await this.delegate.findFirst({
      where: {
        id: memoryId,
        organizationId,
        userId,
      },
    });

    if (!memory) {
      throw new NotFoundException(`Memory entry "${memoryId}" not found`);
    }

    await this.delegate.delete({
      where: { id: memoryId },
    });
  }

  private normalizeKind(value?: string): AgentMemoryKind {
    if (value && AGENT_MEMORY_KINDS.includes(value as AgentMemoryKind)) {
      return value as AgentMemoryKind;
    }

    return 'instruction';
  }

  private normalizeScope(value?: string): AgentMemoryScope {
    if (value && AGENT_MEMORY_SCOPES.includes(value as AgentMemoryScope)) {
      return value as AgentMemoryScope;
    }

    return 'user';
  }

  private normalizeContentType(value?: string): AgentMemoryContentType {
    if (
      value &&
      AGENT_MEMORY_CONTENT_TYPES.includes(value as AgentMemoryContentType)
    ) {
      return value as AgentMemoryContentType;
    }

    return 'generic';
  }

  private normalizeOptionalContentType(
    value?: string,
  ): AgentMemoryContentType | undefined {
    if (
      value &&
      AGENT_MEMORY_CONTENT_TYPES.includes(value as AgentMemoryContentType)
    ) {
      return value as AgentMemoryContentType;
    }

    return undefined;
  }

  private requireCampaignId(campaignId?: string): string {
    if (!campaignId || campaignId.trim() === '') {
      throw new BadRequestException(
        'Campaign-scoped memory requires a valid campaignId.',
      );
    }

    return campaignId;
  }

  private normalizeScore(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return fallback;
    }

    return Math.max(0, Math.min(1, value));
  }

  private scoreMemory(
    memory: AgentMemoryDocument,
    context: {
      pinnedMemoryIds: Set<string>;
      queryTerms: Set<string>;
      requestedType: AgentMemoryContentType;
      requestedBrandId?: string;
    },
  ): number {
    let score = 0;
    const memoryId = String(memory.id);

    if (context.pinnedMemoryIds.has(memoryId)) {
      score += 100;
    }

    if (
      context.requestedBrandId &&
      memory.brandId &&
      String(memory.brandId) === context.requestedBrandId
    ) {
      score += 5;
    }

    if (
      context.requestedType !== 'generic' &&
      memory.contentType === context.requestedType
    ) {
      score += 8;
    } else if (memory.contentType === 'generic') {
      score += 1;
    }

    if (memory.kind === 'winner' || memory.kind === 'pattern') {
      score += 4;
    } else if (memory.kind === 'instruction' || memory.kind === 'preference') {
      score += 3;
    }

    score += (memory.importance ?? 0.5) * 4;
    score += (memory.confidence ?? 0.5) * 2;

    if (context.queryTerms.size > 0) {
      const haystack = [
        memory.content,
        memory.summary,
        memory.platform,
        ...(memory.tags ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      let matches = 0;
      for (const term of context.queryTerms) {
        if (haystack.includes(term)) {
          matches += 1;
        }
      }

      score += matches * 3;
    } else {
      score += 1;
    }

    return score;
  }
}
