import {
  AGENT_MEMORY_CONTENT_TYPES,
  AGENT_MEMORY_KINDS,
  AGENT_MEMORY_LEGACY_SCOPE_ALIASES,
  AGENT_MEMORY_SCOPES,
  type AgentMemoryContentType,
  type AgentMemoryDocument,
  type AgentMemoryKind,
  type AgentMemoryScope,
} from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import { hasOrganizationBilling } from '@genfeedai/config';
import { KnowledgeMemoryScope } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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
  platform?: string;
  limit?: number;
}

export interface AgentFeedbackMemoryInfluence {
  matchedPromptTerms: string[];
  reasons: string[];
  rankingFactors: Record<string, number>;
  score: number;
}

export interface AgentFeedbackMemoryDocument extends AgentMemoryDocument {
  generationInfluence: AgentFeedbackMemoryInfluence;
}

@Injectable()
export class AgentMemoriesService extends BaseService<
  AgentMemoryDocument,
  Partial<AgentMemoryDocument>,
  Partial<AgentMemoryDocument>,
  Prisma.AgentMemoryWhereInput
> {
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
        isDeleted: false,
        organizationId,
        userId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }) as Promise<AgentMemoryDocument[]>;
  }

  async listForOrganization(
    organizationId: string,
    options: { limit?: number } = {},
  ): Promise<AgentMemoryDocument[]> {
    if (!hasOrganizationBilling()) {
      throw new ForbiddenException(
        'Organization-wide memory listing requires organization billing.',
      );
    }

    const { limit = 100 } = options;
    return this.delegate.findMany({
      include: {
        user: {
          select: {
            email: true,
            handle: true,
            id: true,
            name: true,
          },
        },
      },
      where: {
        isDeleted: false,
        organizationId,
        scope: {
          in: [KnowledgeMemoryScope.BRAND, KnowledgeMemoryScope.ORG],
        },
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
    this.assertWritableScope(scope, payload.brandId);
    const campaignId = payload.campaignId
      ? this.requireCampaignId(payload.campaignId)
      : undefined;

    return this.create({
      brandId: payload.brandId,
      campaignId,
      confidence: this.normalizeScore(payload.confidence, 0.5),
      content: payload.content,
      contentType: this.normalizeContentType(payload.contentType),
      importance: this.normalizeScore(payload.importance, 0.5),
      isDeleted: false,
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

    const filter: Prisma.AgentMemoryWhereInput = {
      campaignId: validatedCampaignId,
      isDeleted: false,
      organizationId,
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
      scope: KnowledgeMemoryScope.BRAND,
    });
  }

  async getMemoriesForPrompt(
    userId: string,
    organizationId: string,
    options: MemoryQueryOptions = {},
  ): Promise<AgentMemoryDocument[]> {
    return await this.getFeedbackMemoriesForGeneration(
      userId,
      organizationId,
      options,
    );
  }

  async getFeedbackMemoriesForGeneration(
    userId: string,
    organizationId: string,
    options: MemoryQueryOptions = {},
  ): Promise<AgentFeedbackMemoryDocument[]> {
    const allMemories = await this.listVisibleForGeneration(
      userId,
      organizationId,
      options,
    );
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
    const requestedPlatform = this.normalizeText(options.platform);
    const scored = allMemories
      .map((memory) => {
        const influence = this.scoreFeedbackMemory(memory, {
          pinnedMemoryIds,
          queryTerms,
          requestedBrandId,
          requestedPlatform,
          requestedType,
        });

        return {
          influence,
          memory,
        };
      })
      .filter((entry) => entry.influence.score > 0)
      .sort((left, right) => {
        if (right.influence.score !== left.influence.score) {
          return right.influence.score - left.influence.score;
        }

        const leftTime = this.getMemoryCreatedAtMs(left.memory);
        const rightTime = this.getMemoryCreatedAtMs(right.memory);
        return rightTime - leftTime;
      })
      .slice(0, options.limit ?? 8)
      .map(
        (entry) =>
          ({
            ...entry.memory,
            generationInfluence: entry.influence,
          }) as AgentFeedbackMemoryDocument,
      );

    return scored;
  }

  async removeMemory(
    memoryId: string,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await findOrThrow(
      this.delegate,
      {
        where: {
          id: memoryId,
          isDeleted: false,
          organizationId,
          userId,
        },
      },
      'Memory entry',
      memoryId,
    );

    await this.delegate.update({
      where: { id: memoryId },
      data: { isDeleted: true },
    });
  }

  async archiveMemory(
    memoryId: string,
    organizationId: string,
  ): Promise<AgentMemoryDocument> {
    if (!hasOrganizationBilling()) {
      throw new ForbiddenException(
        'Organization-wide memory archive requires organization billing.',
      );
    }

    await findOrThrow(
      this.delegate,
      {
        where: {
          id: memoryId,
          isDeleted: false,
          organizationId,
          scope: {
            in: [KnowledgeMemoryScope.BRAND, KnowledgeMemoryScope.ORG],
          },
        },
      },
      'Memory entry',
      memoryId,
    );

    return this.delegate.update({
      where: { id: memoryId },
      data: { isDeleted: true },
    }) as Promise<AgentMemoryDocument>;
  }

  private normalizeKind(value?: string): AgentMemoryKind {
    if (value && AGENT_MEMORY_KINDS.includes(value as AgentMemoryKind)) {
      return value as AgentMemoryKind;
    }

    return 'instruction';
  }

  private async listVisibleForGeneration(
    userId: string,
    organizationId: string,
    options: MemoryQueryOptions,
  ): Promise<AgentMemoryDocument[]> {
    const scopeFilters: Prisma.AgentMemoryWhereInput[] = [
      {
        scope: KnowledgeMemoryScope.PERSONAL,
        userId,
      },
    ];

    if (options.brandId) {
      scopeFilters.push({
        brandId: options.brandId,
        scope: KnowledgeMemoryScope.BRAND,
      });
    }

    if (hasOrganizationBilling()) {
      scopeFilters.push({
        scope: KnowledgeMemoryScope.ORG,
      });
    }

    if (options.campaignId) {
      scopeFilters.push({
        campaignId: this.requireCampaignId(options.campaignId),
      });
    }

    return this.delegate.findMany({
      where: {
        isDeleted: false,
        organizationId,
        OR: scopeFilters,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }) as Promise<AgentMemoryDocument[]>;
  }

  private assertWritableScope(scope: AgentMemoryScope, brandId?: string): void {
    if (scope === KnowledgeMemoryScope.ORG && !hasOrganizationBilling()) {
      throw new ForbiddenException(
        'Organization-wide memory requires organization billing.',
      );
    }

    if (scope === KnowledgeMemoryScope.BRAND && !brandId) {
      throw new BadRequestException(
        'Brand-scoped memory requires a valid brandId.',
      );
    }
  }

  private normalizeScope(value?: string): AgentMemoryScope {
    if (!value) {
      return KnowledgeMemoryScope.PERSONAL;
    }

    if (AGENT_MEMORY_SCOPES.includes(value as AgentMemoryScope)) {
      return value as AgentMemoryScope;
    }

    const mapped =
      AGENT_MEMORY_LEGACY_SCOPE_ALIASES[
        value as keyof typeof AGENT_MEMORY_LEGACY_SCOPE_ALIASES
      ];
    if (mapped) {
      return mapped;
    }

    throw new BadRequestException(
      `Memory scope must be one of: ${AGENT_MEMORY_SCOPES.join(', ')}.`,
    );
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

  private scoreFeedbackMemory(
    memory: AgentMemoryDocument,
    context: {
      pinnedMemoryIds: Set<string>;
      queryTerms: Set<string>;
      requestedType: AgentMemoryContentType;
      requestedBrandId?: string;
      requestedPlatform?: string;
    },
  ): AgentFeedbackMemoryInfluence {
    let score = 0;
    const reasons: string[] = [];
    const matchedPromptTerms: string[] = [];
    const rankingFactors: Record<string, number> = {};
    const memoryId = this.resolveMemoryId(memory);
    const addScore = (factor: string, value: number, reason?: string) => {
      if (value <= 0) {
        return;
      }

      const normalized = this.roundScore(value);
      score += normalized;
      rankingFactors[factor] = this.roundScore(
        (rankingFactors[factor] ?? 0) + normalized,
      );
      if (reason) {
        reasons.push(reason);
      }
    };

    if (context.pinnedMemoryIds.has(memoryId)) {
      addScore('pinned', 100, 'Pinned to this thread');
    }

    if (
      context.requestedBrandId &&
      memory.brandId &&
      String(memory.brandId) === context.requestedBrandId
    ) {
      addScore('brand', 6, 'Matches the selected brand');
    }

    const memoryPlatform = this.normalizeText(memory.platform);
    if (
      context.requestedPlatform &&
      memoryPlatform &&
      memoryPlatform === context.requestedPlatform
    ) {
      addScore(
        'platform',
        8,
        `Matches the requested platform ${context.requestedPlatform}`,
      );
    }

    if (
      context.requestedType !== 'generic' &&
      memory.contentType === context.requestedType
    ) {
      addScore(
        'contentType',
        7,
        `Matches requested content type ${context.requestedType}`,
      );
    } else if (memory.contentType === 'generic') {
      addScore('contentType', 1, 'Generic feedback can apply broadly');
    }

    switch (memory.kind) {
      case 'winner':
        addScore('kind', 7, 'Prior winning pattern');
        break;
      case 'pattern':
        addScore('kind', 6, 'Reusable pattern feedback');
        break;
      case 'positive_example':
        addScore('kind', 5, 'Positive example feedback');
        break;
      case 'negative_example':
        addScore('kind', 5, 'Avoidance feedback');
        break;
      case 'preference':
        addScore('kind', 4, 'User preference feedback');
        break;
      case 'reference':
        addScore('kind', 4, 'Reference feedback');
        break;
      case 'instruction':
      default:
        addScore('kind', 3, 'Saved instruction feedback');
        break;
    }

    const importance = this.normalizeScore(memory.importance ?? undefined, 0.5);
    addScore('importance', importance * 3);

    const confidence = this.normalizeScore(memory.confidence ?? undefined, 0.5);
    addScore(
      'confidence',
      confidence * 4,
      confidence >= 0.7
        ? `High confidence feedback (${confidence.toFixed(2)})`
        : undefined,
    );

    const recency = this.scoreRecency(memory);
    addScore(
      'recency',
      recency * 3,
      recency >= 0.66 ? 'Recent feedback' : undefined,
    );

    const performance = this.scorePerformanceRelevance(memory);
    addScore(
      'performance',
      performance.score * 5,
      performance.reason ?? undefined,
    );

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
          matchedPromptTerms.push(term);
        }
      }

      addScore(
        'query',
        matches * 3,
        matches > 0
          ? `Matches prompt terms: ${matchedPromptTerms.join(', ')}`
          : undefined,
      );
    } else {
      addScore('query', 1, 'No specific prompt terms were available');
    }

    return {
      matchedPromptTerms,
      rankingFactors,
      reasons,
      score: this.roundScore(score),
    };
  }

  private scoreRecency(memory: AgentMemoryDocument): number {
    const createdAtMs = this.getMemoryCreatedAtMs(memory);
    if (!createdAtMs) {
      return 0.25;
    }

    const ageDays = Math.max(0, (Date.now() - createdAtMs) / 86_400_000);
    return this.roundScore(Math.max(0, 1 - ageDays / 90));
  }

  private scorePerformanceRelevance(memory: AgentMemoryDocument): {
    reason?: string;
    score: number;
  } {
    const snapshot = this.readPerformanceSnapshot(memory);
    if (!snapshot) {
      return { score: 0 };
    }

    const outcome = this.normalizeText(snapshot.outcome);
    const status = this.normalizeText(snapshot.status);
    const isWinner =
      snapshot.isWinner === true ||
      snapshot.winner === true ||
      outcome === 'winner' ||
      status === 'winner';
    if (isWinner) {
      return {
        reason: 'Performance snapshot marks this as a winner',
        score: 1,
      };
    }

    const candidates = [
      'engagementScore',
      'performanceScore',
      'qualityScore',
      'score',
      'engagementRate',
      'conversionRate',
      'ctr',
    ];
    let best = 0;
    for (const key of candidates) {
      const value = snapshot[key];
      if (typeof value !== 'number' || Number.isNaN(value)) {
        continue;
      }
      const normalized = value > 1 ? value / 100 : value;
      best = Math.max(best, Math.max(0, Math.min(1, normalized)));
    }

    if (best >= 0.7) {
      return {
        reason: `Performance snapshot is strong (${best.toFixed(2)})`,
        score: this.roundScore(best),
      };
    }

    return { score: this.roundScore(best) };
  }

  private readPerformanceSnapshot(
    memory: AgentMemoryDocument,
  ): Record<string, unknown> | null {
    const snapshot = memory.performanceSnapshot;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return null;
    }

    return snapshot as Record<string, unknown>;
  }

  private normalizeText(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    return normalized || undefined;
  }

  private getMemoryCreatedAtMs(memory: AgentMemoryDocument): number {
    const createdAt = (memory as AgentMemoryDocument & { createdAt?: Date })
      .createdAt;
    if (!createdAt) {
      return 0;
    }

    return new Date(createdAt).getTime();
  }

  private resolveMemoryId(memory: AgentMemoryDocument): string {
    const id = memory.id;
    return typeof id === 'string' ? id : String(id ?? '');
  }

  private roundScore(value: number): number {
    return Math.round(value * 1000) / 1000;
  }
}
