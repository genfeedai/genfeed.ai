import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import {
  extractSourceText,
  KNOWLEDGE_SOURCE_MAX_BYTES,
} from '@api/collections/contexts/utils/extract-source-text.util';
import { softDeleteKnowledgeChunks } from '@api/collections/contexts/utils/knowledge-chunk.util';
import {
  KNOWLEDGE_BASE_PURPOSE,
  KNOWLEDGE_SOURCE_CHUNK_KIND,
} from '@api/collections/contexts/utils/knowledge-source.util';
import { chunkText } from '@api/collections/contexts/utils/text-chunker.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  KnowledgeBaseCategory,
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeRetentionState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type {
  KnowledgeSourceBackfillWorkflowInput,
  KnowledgeSourceCapturePayload,
  KnowledgeSourceIngestWorkflowInput,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
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
  versionId: string;
}

export interface KnowledgeSourceIngestSource {
  brandId?: string;
  id: string;
  kind: KnowledgeSourceKind;
  purpose: KnowledgeSourcePurpose;
  scope: KnowledgeMemoryScope;
  title: string;
  userId: string;
}

export interface KnowledgeSourceIngestVersion {
  id: string;
  isCurrent: boolean;
  referenceUrl?: string;
  text?: string;
  version: number;
}

export interface KnowledgeSourceIngestState {
  chunks?: string[];
  extracted?: { mimeType?: string; text: string };
  /** Safe reason recorded when the version cannot be ingested. */
  failure?: string;
  organizationId: string;
  source?: KnowledgeSourceIngestSource;
  sourceId: string;
  status: 'failed' | 'ready' | 'skipped' | 'unsupported';
  version?: KnowledgeSourceIngestVersion;
  versionId: string;
}

export interface KnowledgeSourceBackfillScanResult {
  queued: KnowledgeSourceIngestWorkflowInput[];
}

export const KNOWLEDGE_MAX_FAILURE_REASON_LENGTH = 500;
export const KNOWLEDGE_CONTEXT_BASE_TYPE = 'knowledge';

const FETCHED_CATEGORY_BY_KIND: Partial<
  Record<KnowledgeSourceKind, KnowledgeBaseCategory>
> = {
  [KnowledgeSourceKind.DOCUMENT]: KnowledgeBaseCategory.DOCUMENT,
  [KnowledgeSourceKind.FILE]: KnowledgeBaseCategory.DOCUMENT,
  [KnowledgeSourceKind.URL]: KnowledgeBaseCategory.URL,
};

export function isIngestibleKnowledgeSourceKind(
  kind: KnowledgeSourceKind,
): boolean {
  return kind === KnowledgeSourceKind.TEXT || kind in FETCHED_CATEGORY_BY_KIND;
}

/** Keep failure reasons short, single-line and free of captured content. */
export function toSafeFailureReason(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim() || 'Unknown error';
  return firstLine.slice(0, KNOWLEDGE_MAX_FAILURE_REASON_LENGTH);
}

function readPayload(value: unknown): KnowledgeSourceCapturePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.referenceUrl === 'string' && record.referenceUrl
      ? { referenceUrl: record.referenceUrl }
      : {}),
    ...(typeof record.text === 'string' && record.text.trim()
      ? { text: record.text }
      : {}),
  };
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
    const base: KnowledgeSourceIngestState = {
      organizationId: request.organizationId,
      sourceId: request.sourceId,
      status: 'skipped',
      versionId: request.versionId,
    };
    const row = await this.prisma.knowledgeSourceVersion.findFirst({
      where: {
        id: request.versionId,
        sourceId: request.sourceId,
        organizationId: request.organizationId,
        isDeleted: false,
        source: { is: { isDeleted: false } },
      },
      include: {
        source: {
          select: {
            brandId: true,
            id: true,
            kind: true,
            purpose: true,
            scope: true,
            title: true,
            userId: true,
          },
        },
      },
    });
    if (
      !row?.isCurrent ||
      row.retentionState !== KnowledgeRetentionState.RETAINED
    ) {
      return base;
    }
    const payload = readPayload(row.payload);
    const source: KnowledgeSourceIngestSource = {
      ...(row.source.brandId ? { brandId: row.source.brandId } : {}),
      id: row.source.id,
      kind: row.source.kind,
      purpose: row.source.purpose,
      scope: row.source.scope as KnowledgeMemoryScope,
      title: row.source.title,
      userId: row.source.userId,
    };
    const version: KnowledgeSourceIngestVersion = {
      id: row.id,
      isCurrent: row.isCurrent,
      ...payload,
      version: row.version,
    };
    if (!isIngestibleKnowledgeSourceKind(source.kind)) {
      return {
        ...base,
        failure: `${source.kind} sources are not ingested yet`,
        source,
        status: 'unsupported',
        version,
      };
    }
    const hasContent =
      source.kind === KnowledgeSourceKind.TEXT
        ? Boolean(payload.text)
        : Boolean(payload.referenceUrl);
    if (!hasContent) {
      return {
        ...base,
        failure:
          source.kind === KnowledgeSourceKind.TEXT
            ? 'Source is missing captured text'
            : 'Source is missing a reference URL',
        source,
        status: 'failed',
        version,
      };
    }
    return { ...base, source, status: 'ready', version };
  }

  async markSource(
    state: KnowledgeSourceIngestState,
  ): Promise<KnowledgeSourceIngestState> {
    if (!state.source || state.status === 'skipped') return state;
    if (state.status === 'ready') {
      await this.writeProcessingState(
        state,
        KnowledgeProcessingState.PROCESSING,
      );
      return state;
    }
    await this.writeProcessingState(
      state,
      KnowledgeProcessingState.FAILED,
      state.failure ?? 'Source cannot be ingested',
    );
    return state;
  }

  async extractSource(
    state: KnowledgeSourceIngestState,
  ): Promise<KnowledgeSourceIngestState> {
    if (state.status !== 'ready' || !state.source || !state.version) {
      return state;
    }
    if (state.source.kind === KnowledgeSourceKind.TEXT) {
      const text = state.version.text ?? '';
      if (Buffer.byteLength(text) > KNOWLEDGE_SOURCE_MAX_BYTES) {
        throw new Error(
          `Source exceeds the ${KNOWLEDGE_SOURCE_MAX_BYTES} byte ingest limit`,
        );
      }
      return { ...state, extracted: { mimeType: 'text/plain', text } };
    }
    const category = FETCHED_CATEGORY_BY_KIND[state.source.kind];
    if (!category || !state.version.referenceUrl) {
      throw new Error('Source is missing a reference URL');
    }
    const extracted = await extractSourceText({
      category,
      referenceUrl: state.version.referenceUrl,
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
    if (!state.source || !state.version || !state.extracted || !state.chunks) {
      return state;
    }
    const contextBaseId = await this.ensureContextBase(
      state.organizationId,
      state.source,
    );
    await softDeleteKnowledgeChunks(this.prisma, state.organizationId, {
      sourceId: state.source.id,
    });
    for (const [chunkIndex, content] of state.chunks.entries()) {
      await this.contextsService.addEntry(
        contextBaseId,
        {
          content,
          metadata: {
            chunkIndex,
            kind: KNOWLEDGE_SOURCE_CHUNK_KIND,
            ...(state.extracted.mimeType
              ? { mimeType: state.extracted.mimeType }
              : {}),
            purpose: state.source.purpose,
            ...(state.version.referenceUrl
              ? { referenceUrl: state.version.referenceUrl }
              : {}),
            source: 'knowledge-source',
            sourceId: state.source.id,
            sourceKind: state.source.kind,
            sourceTitle: state.source.title,
            versionId: state.version.id,
          },
        },
        state.organizationId,
        {
          knowledgeSourceId: state.source.id,
          knowledgeSourceVersionId: state.version.id,
        },
      );
    }
    return state;
  }

  async finalizeSource(
    state: KnowledgeSourceIngestState | undefined,
    error?: string,
  ): Promise<KnowledgeSourceIngestResult> {
    if (!state?.source) {
      return {
        chunkCount: 0,
        sourceId: state?.sourceId ?? '',
        status: 'skipped',
        versionId: state?.versionId ?? '',
      };
    }
    if (state.status !== 'ready') {
      return {
        chunkCount: 0,
        sourceId: state.sourceId,
        status: state.status,
        versionId: state.versionId,
      };
    }
    if (error) {
      await this.writeProcessingState(
        state,
        KnowledgeProcessingState.FAILED,
        toSafeFailureReason(error),
      );
      return {
        chunkCount: 0,
        sourceId: state.sourceId,
        status: 'failed',
        versionId: state.versionId,
      };
    }
    await this.writeProcessingState(state, KnowledgeProcessingState.READY);
    return {
      chunkCount: state.chunks?.length ?? 0,
      sourceId: state.sourceId,
      status: 'completed',
      versionId: state.versionId,
    };
  }

  async scanForBackfill(
    input: KnowledgeSourceBackfillWorkflowInput,
  ): Promise<KnowledgeSourceBackfillScanResult> {
    const rows = await this.prisma.knowledgeSourceVersion.findMany({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        isCurrent: true,
        retentionState: KnowledgeRetentionState.RETAINED,
        processingState: {
          in: [
            KnowledgeProcessingState.QUEUED,
            KnowledgeProcessingState.PROCESSING,
            KnowledgeProcessingState.FAILED,
          ],
        },
        source: { is: { isDeleted: false } },
      },
      select: { id: true, sourceId: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      queued: rows.map((row) => ({
        organizationId: input.organizationId,
        sourceId: row.sourceId,
        versionId: row.id,
      })),
    };
  }

  /**
   * Chunks live in one context base per Knowledge scope (brand, organization
   * or personal) so brand retrieval keeps selecting bases by brand while the
   * version link carries per-source eligibility. Creation serializes on an
   * advisory lock so concurrent first ingests share one base.
   */
  private async ensureContextBase(
    organizationId: string,
    source: KnowledgeSourceIngestSource,
  ): Promise<string> {
    const brandId =
      source.scope === KnowledgeMemoryScope.BRAND
        ? (source.brandId ?? null)
        : null;
    const createdById =
      source.scope === KnowledgeMemoryScope.PERSONAL ? source.userId : null;
    const where = scopedWhere(organizationId, {
      AND: [
        { data: { equals: KNOWLEDGE_BASE_PURPOSE, path: ['purpose'] } },
        { data: { equals: source.scope, path: ['knowledgeScope'] } },
      ],
      sourceBrandId: brandId,
      ...(createdById ? { createdById } : {}),
    });
    const existing = await this.prisma.contextBase.findFirst({
      select: { id: true },
      where,
    });
    if (existing) return existing.id;
    return this.prisma.$transaction(async (tx) => {
      const key = JSON.stringify([
        organizationId,
        source.scope,
        brandId,
        createdById,
      ]);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const locked = await tx.contextBase.findFirst({
        select: { id: true },
        where,
      });
      if (locked) return locked.id;
      const created = await tx.contextBase.create({
        data: {
          ...(createdById ? { createdById } : {}),
          ...(brandId ? { sourceBrandId: brandId } : {}),
          data: {
            category: KNOWLEDGE_CONTEXT_BASE_TYPE,
            entryCount: 0,
            isActive: true,
            knowledgeScope: source.scope,
            label: 'Knowledge',
            purpose: KNOWLEDGE_BASE_PURPOSE,
            source: 'knowledge',
            type: KNOWLEDGE_CONTEXT_BASE_TYPE,
            usageCount: 0,
          } satisfies Prisma.InputJsonObject,
          organizationId,
        },
        select: { id: true },
      });
      return created.id;
    });
  }

  private async writeProcessingState(
    state: KnowledgeSourceIngestState,
    processingState: KnowledgeProcessingState,
    processingError?: string,
  ): Promise<void> {
    await this.prisma.knowledgeSourceVersion.updateMany({
      where: {
        id: state.versionId,
        sourceId: state.sourceId,
        organizationId: state.organizationId,
        isDeleted: false,
      },
      data: {
        processingState,
        processingError:
          processingState === KnowledgeProcessingState.FAILED
            ? (processingError ?? 'Ingestion failed')
            : null,
      },
    });
  }
}
