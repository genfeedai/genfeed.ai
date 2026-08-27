import { randomUUID } from 'node:crypto';
import { AddSourceDto } from '@api/collections/contexts/dto/add-source.dto';
import { UpdateSourceDto } from '@api/collections/contexts/dto/update-source.dto';
import type { ContextBase } from '@api/collections/contexts/schemas/context-base.schema';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { KnowledgeSourceIngestService } from '@api/collections/contexts/services/knowledge-source-ingest.service';
import {
  findKnowledgeSource,
  type PersistedKnowledgeSource,
  parseKnowledgeSources,
  upsertKnowledgeSource,
  writeKnowledgeSources,
} from '@api/collections/contexts/utils/knowledge-source.util';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { KnowledgeSourceIngestQueueService } from '@api/queues/knowledge-source-ingest/knowledge-source-ingest-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { KnowledgeBaseStatus } from '@genfeedai/enums';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

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
    private readonly ingestService: KnowledgeSourceIngestService,
    private readonly logger: LoggerService,
    @Optional()
    private readonly ingestQueue?: KnowledgeSourceIngestQueueService,
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
    const jobId = this.ingestQueue
      ? await this.ingestQueue.enqueueBackfill({ organizationId })
      : null;

    if (jobId) {
      return { jobId, queued: 1 };
    }

    const scan = await this.ingestService.scanForBackfill({ organizationId });
    let queued = 0;
    for (const item of scan.queued) {
      await this.ingestService.ingest(item);
      queued += 1;
    }

    this.logger.log('Ran knowledge source backfill inline', {
      organizationId,
      queued,
    });

    return { jobId: null, queued };
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
  ): Promise<string | null> {
    if (!this.ingestQueue) {
      this.logger.warn(
        'Knowledge source ingest queue unavailable; ingesting inline',
        {
          contextBaseId,
          organizationId,
          sourceId,
        },
      );
      await this.ingestService.ingest({
        contextBaseId,
        organizationId,
        sourceId,
      });
      return null;
    }

    const jobId = await this.ingestQueue.enqueueIngest({
      contextBaseId,
      organizationId,
      sourceId,
    });
    if (jobId) {
      return jobId;
    }

    this.logger.warn(
      'Knowledge source ingest queue unavailable; ingesting inline',
      {
        contextBaseId,
        organizationId,
        sourceId,
      },
    );
    await this.ingestService.ingest({
      contextBaseId,
      organizationId,
      sourceId,
    });
    return null;
  }
}
