import type {
  AgentMemoryContentType,
  AgentMemoryKind,
  AgentMemoryScope,
} from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import type { AddEntryDto } from '@api/collections/contexts/dto/add-entry.dto';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

interface CaptureAgentMemoryPayload {
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
  saveToContextMemory?: boolean;
}

@Injectable()
export class AgentMemoryCaptureService {
  constructor(
    private readonly agentMemoriesService: AgentMemoriesService,
    private readonly contextsService: ContextsService,
    private readonly brandMemoryService: BrandMemoryService,
    private readonly loggerService: LoggerService,
  ) {}

  async capture(
    userId: string,
    organizationId: string,
    payload: CaptureAgentMemoryPayload,
  ): Promise<{
    memory: Awaited<ReturnType<AgentMemoriesService['createMemory']>>;
    wroteBrandInsight: boolean;
    wroteContextMemory: boolean;
  }> {
    const memory = await this.agentMemoriesService.createMemory(
      userId,
      organizationId,
      payload,
    );

    const shouldWriteBrandInsight =
      Boolean(payload.brandId) &&
      (payload.scope === 'brand' ||
        payload.kind === 'winner' ||
        payload.kind === 'pattern');

    const shouldWriteContextMemory =
      Boolean(payload.brandId) &&
      (payload.scope === 'brand' ||
        payload.saveToContextMemory === true ||
        payload.contentType === 'newsletter' ||
        payload.kind === 'reference' ||
        payload.kind === 'positive_example');

    if (shouldWriteBrandInsight && payload.brandId) {
      await this.brandMemoryService.addInsight(
        organizationId,
        payload.brandId,
        {
          category: payload.kind ?? 'reference',
          confidence: this.normalizeScore(payload.confidence, 0.6),
          createdAt: new Date(),
          insight: payload.summary || this.summarize(payload.content),
          source: payload.sourceType || 'agent-save',
        },
      );
    }

    if (shouldWriteContextMemory && payload.brandId) {
      const contextBaseId = await this.resolveOrCreateBrandContextBase(
        organizationId,
        userId,
        payload.brandId,
      );

      const entry: AddEntryDto = {
        content: payload.content,
        metadata: {
          contentType: payload.contentType ?? 'generic',
          engagementScore:
            typeof payload.performanceSnapshot?.engagementScore === 'number'
              ? payload.performanceSnapshot.engagementScore
              : undefined,
          source: payload.sourceType || 'agent-save',
          sourceId: payload.sourceContentId || String(memory._id),
          sourceUrl: payload.sourceUrl,
          tags: payload.tags,
        },
        relevanceWeight: this.normalizeScore(payload.importance, 0.75),
      };

      await this.contextsService.addEntry(contextBaseId, entry, organizationId);
    }

    return {
      memory,
      wroteBrandInsight: shouldWriteBrandInsight,
      wroteContextMemory: shouldWriteContextMemory,
    };
  }

  private async resolveOrCreateBrandContextBase(
    organizationId: string,
    userId: string,
    brandId: string,
  ): Promise<string> {
    const existing = await this.contextsService.findAll(organizationId, {
      category: 'content_library',
      isActive: true,
    });
    const matching = existing.find(
      (item) =>
        item.sourceBrand &&
        String(item.sourceBrand) === brandId &&
        !item.isDeleted,
    );

    if (matching?._id) {
      return String(matching._id);
    }

    const created = await this.contextsService.create(
      {
        description:
          'Saved examples, references, and winning content captured from the agent.',
        label: 'Saved Content Memory',
        source: 'manual',
        sourceBrand: brandId,
        type: 'content_library',
      },
      organizationId,
      userId,
    );

    this.loggerService.log('Created content memory context base', {
      brandId,
      contextBaseId: String(created._id),
      organizationId,
    });

    return String(created._id);
  }

  private normalizeScore(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return fallback;
    }

    return Math.max(0, Math.min(1, value));
  }

  private summarize(content: string): string {
    const trimmed = content.trim().replace(/\s+/g, ' ');
    if (trimmed.length <= 220) {
      return trimmed;
    }

    return `${trimmed.slice(0, 217)}...`;
  }
}
