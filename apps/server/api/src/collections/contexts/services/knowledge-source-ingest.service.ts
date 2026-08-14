import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import {
  extractSourceText,
  isIngestibleKnowledgeSourceCategory,
} from '@api/collections/contexts/utils/extract-source-text.util';
import {
  findKnowledgeSource,
  KNOWLEDGE_SOURCE_CHUNK_KIND,
  type PersistedKnowledgeSource,
  parseKnowledgeSources,
  sourceNeedsIngest,
  upsertKnowledgeSource,
  writeKnowledgeSources,
} from '@api/collections/contexts/utils/knowledge-source.util';
import { chunkText } from '@api/collections/contexts/utils/text-chunker.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { KnowledgeBaseStatus } from '@genfeedai/enums';
import type {
  KnowledgeSourceBackfillJobData,
  KnowledgeSourceIngestJobData,
} from '@genfeedai/queue-contracts';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type KnowledgeSourceIngestStatus =
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'unsupported';

export interface KnowledgeSourceIngestResult {
  chunkCount: number;
  sourceId: string;
  status: KnowledgeSourceIngestStatus;
}

export interface KnowledgeSourceBackfillScanResult {
  queued: Array<{
    contextBaseId: string;
    organizationId: string;
    sourceId: string;
  }>;
}

@Injectable()
export class KnowledgeSourceIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextsService: ContextsService,
    private readonly logger: LoggerService,
  ) {}

  async ingest(
    job: KnowledgeSourceIngestJobData,
  ): Promise<KnowledgeSourceIngestResult> {
    const contextBase = await this.prisma.contextBase.findFirst({
      where: scopedWhere(job.organizationId, { id: job.contextBaseId }),
    });

    if (!contextBase) {
      return { chunkCount: 0, sourceId: job.sourceId, status: 'skipped' };
    }

    const sources = parseKnowledgeSources(contextBase.data);
    const source = findKnowledgeSource(sources, job.sourceId);
    if (!source || source.isDeleted) {
      return { chunkCount: 0, sourceId: job.sourceId, status: 'skipped' };
    }

    if (!isIngestibleKnowledgeSourceCategory(source.category)) {
      await this.persistSource(contextBase.id, contextBase.data, sources, {
        ...source,
        error: `${source.category} sources are not ingested yet`,
        status: KnowledgeBaseStatus.FAILED,
      });
      return { chunkCount: 0, sourceId: source.id, status: 'unsupported' };
    }

    if (!source.referenceUrl) {
      await this.persistSource(contextBase.id, contextBase.data, sources, {
        ...source,
        error: 'Source is missing a reference URL',
        status: KnowledgeBaseStatus.FAILED,
      });
      return { chunkCount: 0, sourceId: source.id, status: 'failed' };
    }

    await this.persistSource(contextBase.id, contextBase.data, sources, {
      ...source,
      error: undefined,
      status: KnowledgeBaseStatus.PROCESSING,
    });

    try {
      const extracted = await extractSourceText({
        category: source.category,
        referenceUrl: source.referenceUrl,
      });
      const chunks = chunkText(extracted.text);

      await this.contextsService.removeEntriesBySource(
        contextBase.id,
        source.id,
        job.organizationId,
      );

      for (const [chunkIndex, content] of chunks.entries()) {
        await this.contextsService.addEntry(
          contextBase.id,
          {
            content,
            metadata: {
              chunkIndex,
              kind: KNOWLEDGE_SOURCE_CHUNK_KIND,
              mimeType: extracted.mimeType,
              referenceUrl: source.referenceUrl,
              source: 'knowledge-source',
              sourceCategory: source.category,
              sourceId: source.id,
              sourceLabel: source.label,
            },
          },
          job.organizationId,
        );
      }

      await this.persistSource(contextBase.id, contextBase.data, sources, {
        ...source,
        chunkCount: chunks.length,
        error: undefined,
        lastIngestedAt: new Date().toISOString(),
        status: KnowledgeBaseStatus.COMPLETED,
      });

      this.logger.log('Ingested knowledge source', {
        chunkCount: chunks.length,
        contextBaseId: contextBase.id,
        organizationId: job.organizationId,
        sourceId: source.id,
      });

      return {
        chunkCount: chunks.length,
        sourceId: source.id,
        status: 'completed',
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Knowledge source ingest failed';
      await this.persistSource(contextBase.id, contextBase.data, sources, {
        ...source,
        error: message,
        status: KnowledgeBaseStatus.FAILED,
      });
      this.logger.error('Failed to ingest knowledge source', {
        contextBaseId: contextBase.id,
        error,
        organizationId: job.organizationId,
        sourceId: source.id,
      });
      return { chunkCount: 0, sourceId: source.id, status: 'failed' };
    }
  }

  async scanForBackfill(
    input: KnowledgeSourceBackfillJobData = {},
  ): Promise<KnowledgeSourceBackfillScanResult> {
    const rows = await this.prisma.contextBase.findMany({
      where: input.organizationId
        ? scopedWhere(input.organizationId, {})
        : { isDeleted: false },
    });

    const queued: KnowledgeSourceBackfillScanResult['queued'] = [];

    for (const row of rows) {
      for (const source of parseKnowledgeSources(row.data)) {
        if (!sourceNeedsIngest(source)) {
          continue;
        }
        queued.push({
          contextBaseId: row.id,
          organizationId: row.organizationId,
          sourceId: source.id,
        });
      }
    }

    return { queued };
  }

  private async persistSource(
    contextBaseId: string,
    currentData: unknown,
    sources: PersistedKnowledgeSource[],
    next: PersistedKnowledgeSource,
  ): Promise<void> {
    const cleaned: PersistedKnowledgeSource = { ...next };
    if (!cleaned.error) {
      delete cleaned.error;
    }

    await this.prisma.contextBase.update({
      data: {
        data: writeKnowledgeSources(
          currentData,
          upsertKnowledgeSource(sources, cleaned),
        ),
      },
      where: { id: contextBaseId },
    });
  }
}
