import { randomUUID } from 'node:crypto';
import { KnowledgeBaseStatus } from '@genfeedai/enums';
import { scopedWhere } from '@genfeedai/server';
import { Injectable } from '@nestjs/common';
import { AddSourceDto } from '@server/collections/contexts/dto/add-source.dto';
import { UpdateSourceDto } from '@server/collections/contexts/dto/update-source.dto';
import type { ContextBase } from '@server/collections/contexts/schemas/context-base.schema';
import { ContextsService } from '@server/collections/contexts/services/contexts.service';
import { KnowledgeSourceIngestWorkflowService } from '@server/collections/contexts/services/knowledge-source-ingest-workflow.service';
import {
  findKnowledgeSource,
  type PersistedKnowledgeSource,
  parseKnowledgeSources,
  upsertKnowledgeSource,
  writeKnowledgeSources,
} from '@server/collections/contexts/utils/knowledge-source.util';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

export interface KnowledgeSourceMutationResult {
  contextBase: ContextBase;
  jobId: string | null;
  source: PersistedKnowledgeSource;
}

export interface KnowledgeSourceBackfillResult {
  jobId: string | null;
  queued: number;
}

@Injectable()
export class KnowledgeSourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextsService: ContextsService,
    private readonly ingestWorkflow: KnowledgeSourceIngestWorkflowService,
  ) {}

  async addSource(
    contextBaseId: string,
    dto: AddSourceDto,
    organizationId: string,
  ): Promise<KnowledgeSourceMutationResult> {
    const contextBase = await this.contextsService.findOne(
      contextBaseId,
      organizationId,
    );
    const sources = parseKnowledgeSources(contextBase.data);
    const source: PersistedKnowledgeSource = {
      category: dto.category,
      id: `src_${randomUUID()}`,
      label: dto.label.trim(),
      referenceUrl: dto.referenceUrl,
      status: KnowledgeBaseStatus.DRAFT,
      ...(dto.summary ? { summary: dto.summary } : {}),
      ...(dto.tags ? { tags: dto.tags } : {}),
    };

    await this.writeSources(
      organizationId,
      contextBase.id,
      contextBase.data,
      upsertKnowledgeSource(sources, source),
    );
    const jobId = await this.enqueueIngest(
      organizationId,
      contextBase.id,
      source.id,
    );

    return {
      contextBase: await this.contextsService.findOne(
        contextBase.id,
        organizationId,
      ),
      jobId,
      source,
    };
  }

  async updateSource(
    contextBaseId: string,
    sourceId: string,
    dto: UpdateSourceDto,
    organizationId: string,
  ): Promise<KnowledgeSourceMutationResult> {
    const contextBase = await this.contextsService.findOne(
      contextBaseId,
      organizationId,
    );
    const sources = parseKnowledgeSources(contextBase.data);
    const existing = this.requireLiveSource(sources, sourceId);
    const referenceChanged =
      dto.referenceUrl !== undefined &&
      dto.referenceUrl !== existing.referenceUrl;
    const categoryChanged =
      dto.category !== undefined && dto.category !== existing.category;

    const source: PersistedKnowledgeSource = {
      ...existing,
      ...(dto.category ? { category: dto.category } : {}),
      ...(dto.label ? { label: dto.label.trim() } : {}),
      ...(dto.referenceUrl ? { referenceUrl: dto.referenceUrl } : {}),
      ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
      ...(dto.tags ? { tags: dto.tags } : {}),
    };

    const shouldReingest = referenceChanged || categoryChanged;
    if (shouldReingest) {
      source.status = KnowledgeBaseStatus.DRAFT;
      delete source.error;
    }

    await this.writeSources(
      organizationId,
      contextBase.id,
      contextBase.data,
      upsertKnowledgeSource(sources, source),
    );

    const jobId = shouldReingest
      ? await this.enqueueIngest(organizationId, contextBase.id, source.id)
      : null;

    return {
      contextBase: await this.contextsService.findOne(
        contextBase.id,
        organizationId,
      ),
      jobId,
      source,
    };
  }

  async removeSource(
    contextBaseId: string,
    sourceId: string,
    organizationId: string,
  ): Promise<{ sourceId: string }> {
    const contextBase = await this.contextsService.findOne(
      contextBaseId,
      organizationId,
    );
    const sources = parseKnowledgeSources(contextBase.data);
    const existing = this.requireLiveSource(sources, sourceId);

    await this.writeSources(
      organizationId,
      contextBase.id,
      contextBase.data,
      upsertKnowledgeSource(sources, { ...existing, isDeleted: true }),
    );
    await this.contextsService.removeEntriesBySource(
      contextBase.id,
      sourceId,
      organizationId,
    );

    return { sourceId };
  }

  async backfill(
    organizationId: string,
  ): Promise<KnowledgeSourceBackfillResult> {
    const jobId = await this.ingestWorkflow.enqueueBackfill({ organizationId });
    return { jobId, queued: 1 };
  }

  private requireLiveSource(
    sources: PersistedKnowledgeSource[],
    sourceId: string,
  ): PersistedKnowledgeSource {
    const existing = findKnowledgeSource(sources, sourceId);
    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Knowledge source');
    }
    return existing;
  }

  private async writeSources(
    organizationId: string,
    contextBaseId: string,
    currentData: unknown,
    sources: PersistedKnowledgeSource[],
  ): Promise<void> {
    await this.prisma.contextBase.update({
      data: {
        data: writeKnowledgeSources(currentData, sources),
      },
      where: scopedWhere(organizationId, { id: contextBaseId }),
    });
  }

  private async enqueueIngest(
    organizationId: string,
    contextBaseId: string,
    sourceId: string,
  ): Promise<string> {
    return this.ingestWorkflow.enqueueIngest({
      contextBaseId,
      organizationId,
      sourceId,
    });
  }
}
