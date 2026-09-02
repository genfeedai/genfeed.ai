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
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { KnowledgeBaseStatus } from '@genfeedai/enums';
import type {
  KnowledgeSourceBackfillWorkflowInput,
  KnowledgeSourceIngestWorkflowInput,
} from '@genfeedai/interfaces';
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

export interface KnowledgeSourceIngestState {
  chunks?: string[];
  contextBaseId: string;
  currentData: unknown;
  extracted?: { mimeType?: string; text: string };
  organizationId: string;
  source?: PersistedKnowledgeSource;
  sources: PersistedKnowledgeSource[];
  status: KnowledgeSourceIngestStatus | 'ready';
}

@Injectable()
export class KnowledgeSourceIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextsService: ContextsService,
  ) {}

  async loadSource(
    request: KnowledgeSourceIngestWorkflowInput,
  ): Promise<KnowledgeSourceIngestState> {
    const contextBase = await this.prisma.contextBase.findFirst({
      where: scopedWhere(request.organizationId, { id: request.contextBaseId }),
    });
    if (!contextBase) {
      return {
        contextBaseId: request.contextBaseId,
        currentData: {},
        organizationId: request.organizationId,
        sources: [],
        status: 'skipped',
      };
    }
    const sources = parseKnowledgeSources(contextBase.data);
    const source = findKnowledgeSource(sources, request.sourceId);
    if (!source || source.isDeleted) {
      return {
        contextBaseId: contextBase.id,
        currentData: contextBase.data,
        organizationId: request.organizationId,
        sources,
        status: 'skipped',
      };
    }
    return {
      contextBaseId: contextBase.id,
      currentData: contextBase.data,
      organizationId: request.organizationId,
      source,
      sources,
      status: !isIngestibleKnowledgeSourceCategory(source.category)
        ? 'unsupported'
        : source.referenceUrl
          ? 'ready'
          : 'failed',
    };
  }

  async markSource(
    state: KnowledgeSourceIngestState,
  ): Promise<KnowledgeSourceIngestState> {
    if (!state.source || state.status === 'skipped') return state;
    const { error: _previousError, ...sourceWithoutError } = state.source;
    const next =
      state.status === 'ready'
        ? {
            ...sourceWithoutError,
            status: KnowledgeBaseStatus.PROCESSING,
          }
        : {
            ...sourceWithoutError,
            error:
              state.status === 'unsupported'
                ? `${state.source.category} sources are not ingested yet`
                : 'Source is missing a reference URL',
            status: KnowledgeBaseStatus.FAILED,
          };
    await this.persistSource(
      state.organizationId,
      state.contextBaseId,
      state.currentData,
      state.sources,
      next,
    );
    return { ...state, source: next };
  }

  async extractSource(
    state: KnowledgeSourceIngestState,
  ): Promise<KnowledgeSourceIngestState> {
    if (state.status !== 'ready' || !state.source?.referenceUrl) return state;
    const extracted = await extractSourceText({
      category: state.source.category,
      referenceUrl: state.source.referenceUrl,
    });
    return { ...state, extracted };
  }

  chunkSource(state: KnowledgeSourceIngestState): KnowledgeSourceIngestState {
    if (!state.extracted) return state;
    return { ...state, chunks: chunkText(state.extracted.text) };
  }

  async replaceChunks(
    state: KnowledgeSourceIngestState,
  ): Promise<KnowledgeSourceIngestState> {
    if (!state.source || !state.extracted || !state.chunks) return state;
    await this.contextsService.removeEntriesBySource(
      state.contextBaseId,
      state.source.id,
      state.organizationId,
    );
    for (const [chunkIndex, content] of state.chunks.entries()) {
      await this.contextsService.addEntry(
        state.contextBaseId,
        {
          content,
          metadata: {
            chunkIndex,
            kind: KNOWLEDGE_SOURCE_CHUNK_KIND,
            ...(state.extracted.mimeType
              ? { mimeType: state.extracted.mimeType }
              : {}),
            referenceUrl: state.source.referenceUrl,
            source: 'knowledge-source',
            sourceCategory: state.source.category,
            sourceId: state.source.id,
            sourceLabel: state.source.label,
          },
        },
        state.organizationId,
      );
    }
    return state;
  }

  async finalizeSource(
    state: KnowledgeSourceIngestState | undefined,
    error?: string,
  ): Promise<KnowledgeSourceIngestResult> {
    if (!state?.source) {
      return { chunkCount: 0, sourceId: '', status: 'skipped' };
    }
    if (state.status !== 'ready') {
      return { chunkCount: 0, sourceId: state.source.id, status: state.status };
    }
    const { error: _previousError, ...sourceWithoutError } = state.source;
    const next = {
      ...sourceWithoutError,
      chunkCount: error ? 0 : (state.chunks?.length ?? 0),
      ...(error ? { error } : { lastIngestedAt: new Date().toISOString() }),
      status: error
        ? KnowledgeBaseStatus.FAILED
        : KnowledgeBaseStatus.COMPLETED,
    };
    await this.persistSource(
      state.organizationId,
      state.contextBaseId,
      state.currentData,
      state.sources,
      next,
    );
    return {
      chunkCount: next.chunkCount,
      sourceId: state.source.id,
      status: error ? 'failed' : 'completed',
    };
  }

  async scanForBackfill(
    input: KnowledgeSourceBackfillWorkflowInput,
  ): Promise<KnowledgeSourceBackfillScanResult> {
    const rows = await this.prisma.contextBase.findMany({
      where: scopedWhere(input.organizationId, {}),
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
    organizationId: string,
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
      where: scopedWhere(organizationId, { id: contextBaseId }),
    });
  }
}
