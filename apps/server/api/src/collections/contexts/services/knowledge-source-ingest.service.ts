import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { KnowledgeTranscriptIngestService } from '@api/collections/contexts/services/knowledge-transcript-ingest.service';
import {
  extractSourceText,
  KNOWLEDGE_SOURCE_MAX_BYTES,
} from '@api/collections/contexts/utils/extract-source-text.util';
import { softDeleteKnowledgeChunks } from '@api/collections/contexts/utils/knowledge-chunk.util';
import {
  isKnowledgeMemoryScope,
  isKnowledgeSourceKind,
  isKnowledgeSourcePurpose,
  KNOWLEDGE_BASE_PURPOSE,
  KNOWLEDGE_SOURCE_CHUNK_KIND,
} from '@api/collections/contexts/utils/knowledge-source.util';
import { chunkTranscriptCues } from '@api/collections/contexts/utils/knowledge-transcript.util';
import { chunkText } from '@api/collections/contexts/utils/text-chunker.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  KnowledgeBaseCategory,
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeRefreshRunOutcome,
  KnowledgeRefreshRunStatus,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
  KnowledgeSourceSyncState,
  KnowledgeTranscriptState,
} from '@genfeedai/contracts';
import type {
  KnowledgeSourceBackfillWorkflowInput,
  KnowledgeSourceCapturePayload,
  KnowledgeSourceIngestWorkflowInput,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { Injectable, Optional } from '@nestjs/common';

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
  isTranscriptGenerationAllowed?: boolean;
  referenceUrl?: string;
  text?: string;
  transcriptUrl?: string;
  version: number;
}

export interface KnowledgeSourceIngestState {
  chunks?: string[];
  extracted?: {
    endMs?: number;
    mediaUrl?: string;
    mimeType?: string;
    startMs?: number;
    text: string;
  };
  extractedCues?: Array<{ endMs: number; startMs: number; text: string }>;
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
  [KnowledgeSourceKind.AUDIO]: KnowledgeBaseCategory.AUDIO,
  [KnowledgeSourceKind.DOCUMENT]: KnowledgeBaseCategory.DOCUMENT,
  [KnowledgeSourceKind.FILE]: KnowledgeBaseCategory.DOCUMENT,
  [KnowledgeSourceKind.RSS]: KnowledgeBaseCategory.RSS,
  [KnowledgeSourceKind.URL]: KnowledgeBaseCategory.URL,
  [KnowledgeSourceKind.VIDEO]: KnowledgeBaseCategory.VIDEO,
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
      : typeof record.extractedText === 'string' && record.extractedText.trim()
        ? { text: record.extractedText }
        : {}),
    ...(typeof record.transcriptUrl === 'string' && record.transcriptUrl
      ? { transcriptUrl: record.transcriptUrl }
      : {}),
    ...(record.isTranscriptGenerationAllowed === true
      ? { isTranscriptGenerationAllowed: true }
      : {}),
  };
}

@Injectable()
export class KnowledgeSourceIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextsService: ContextsService,
    @Optional() private readonly transcripts?: KnowledgeTranscriptIngestService,
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
    const isRefreshCandidate = Boolean(
      row &&
        !row.isCurrent &&
        row.retentionState === KnowledgeRetentionState.RETAINED &&
        (row.processingState === KnowledgeProcessingState.QUEUED ||
          row.processingState === KnowledgeProcessingState.PROCESSING),
    );
    if (
      !row ||
      row.retentionState !== KnowledgeRetentionState.RETAINED ||
      (!row.isCurrent && !isRefreshCandidate)
    ) {
      return base;
    }
    const payload = readPayload(row.payload);
    // Prisma enums are string unions; the shared contracts enums carry the
    // same persisted labels, so the guards narrow without a cast.
    if (
      !isKnowledgeSourceKind(row.source.kind) ||
      !isKnowledgeSourcePurpose(row.source.purpose) ||
      !isKnowledgeMemoryScope(row.source.scope)
    ) {
      return base;
    }
    const source: KnowledgeSourceIngestSource = {
      ...(row.source.brandId ? { brandId: row.source.brandId } : {}),
      id: row.source.id,
      kind: row.source.kind,
      purpose: row.source.purpose,
      scope: row.source.scope,
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
    if (
      state.version.text &&
      state.source.kind !== KnowledgeSourceKind.AUDIO &&
      state.source.kind !== KnowledgeSourceKind.VIDEO
    ) {
      return {
        ...state,
        extracted: { mimeType: 'text/plain', text: state.version.text },
      };
    }
    if (
      (state.source.kind === KnowledgeSourceKind.AUDIO ||
        state.source.kind === KnowledgeSourceKind.VIDEO) &&
      this.transcripts
    ) {
      try {
        const transcript = await this.transcripts.resolve({
          kind: state.source.kind,
          organizationId: state.organizationId,
          payload: {
            isTranscriptGenerationAllowed:
              state.version.isTranscriptGenerationAllowed,
            referenceUrl: state.version.referenceUrl,
            transcriptUrl: state.version.transcriptUrl,
          },
          referenceUrl: state.version.referenceUrl,
          sourceId: state.source.id,
          userId: state.source.userId,
          versionId: state.version.id,
        });
        return {
          ...state,
          extracted: {
            mediaUrl: transcript.mediaUrl,
            mimeType: transcript.mimeType,
            text: transcript.text,
          },
          extractedCues: transcript.cues,
        };
      } catch (error: unknown) {
        const transcriptState =
          error &&
          typeof error === 'object' &&
          'transcriptState' in error &&
          typeof error.transcriptState === 'string'
            ? error.transcriptState
            : KnowledgeTranscriptState.UNAVAILABLE;
        await this.prisma.knowledgeSourceVersion.updateMany({
          where: scopedWhere(state.organizationId, {
            id: state.versionId,
            sourceId: state.sourceId,
          }),
          data: { transcriptState },
        });
        throw error;
      }
    }
    const extracted = await extractSourceText({
      category,
      referenceUrl: state.version.referenceUrl,
    });
    return { ...state, extracted };
  }

  chunkSource(state: KnowledgeSourceIngestState): KnowledgeSourceIngestState {
    if (!state.extracted) return state;
    if (state.extractedCues && state.extractedCues.length > 0) {
      const chunks = chunkTranscriptCues(state.extractedCues, chunkText);
      return {
        ...state,
        chunks: chunks.map((chunk) => chunk.text),
        extractedCues: chunks,
      };
    }
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
    const sourceId = state.source.id;
    const versionId = state.version.id;
    await this.prisma.$transaction(async (tx) => {
      // Take the same source row lock createVersion holds, then re-read
      // isCurrent: the flag loaded at the start of this run may be stale, and
      // a superseded run must only replace its own version's chunks.
      await tx.knowledgeSource.updateMany({
        where: scopedWhere(state.organizationId, { id: sourceId }),
        data: { updatedAt: new Date() },
      });
      const live = await tx.knowledgeSourceVersion.findFirst({
        where: scopedWhere(state.organizationId, { id: versionId, sourceId }),
        select: { isCurrent: true },
      });
      await softDeleteKnowledgeChunks(tx, state.organizationId, {
        sourceId,
        ...(live?.isCurrent ? {} : { versionId }),
      });
    });
    for (const [chunkIndex, content] of state.chunks.entries()) {
      const cue = state.extractedCues?.[chunkIndex];
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
            ...(cue
              ? {
                  endMs: cue.endMs,
                  mediaUrl:
                    state.extracted.mediaUrl ?? state.version.referenceUrl,
                  startMs: cue.startMs,
                }
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
      if (state.version?.isCurrent) {
        await this.settleCaptureRequests(
          state,
          'failed',
          state.failure ?? 'Source cannot be ingested',
        );
      }
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
      if (state.version && !state.version.isCurrent) {
        await this.failRefreshCandidate(state, toSafeFailureReason(error));
      } else {
        await this.settleCaptureRequests(
          state,
          'failed',
          toSafeFailureReason(error),
        );
      }
      return {
        chunkCount: 0,
        sourceId: state.sourceId,
        status: 'failed',
        versionId: state.versionId,
      };
    }
    await this.writeProcessingState(state, KnowledgeProcessingState.READY);
    if (state.version && !state.version.isCurrent) {
      await this.promoteRefreshCandidate(state);
    } else {
      await this.settleCaptureRequests(state, 'completed');
    }
    return {
      chunkCount: state.chunks?.length ?? 0,
      sourceId: state.sourceId,
      status: 'completed',
      versionId: state.versionId,
    };
  }

  private async promoteRefreshCandidate(
    state: KnowledgeSourceIngestState,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const run = await tx.knowledgeSourceRefreshRun.findFirst({
        where: scopedWhere(state.organizationId, {
          candidateVersionId: state.versionId,
          sourceId: state.sourceId,
          status: KnowledgeRefreshRunStatus.PROCESSING,
        }),
      });
      if (!run) {
        return;
      }
      const current = await tx.knowledgeSourceVersion.findFirst({
        where: scopedWhere(state.organizationId, {
          isCurrent: true,
          sourceId: state.sourceId,
        }),
        select: { id: true },
      });
      if (
        run.expectedCurrentVersionId &&
        current &&
        current.id !== run.expectedCurrentVersionId
      ) {
        await this.writeFailedRefreshRun(
          tx,
          state,
          now,
          'Source changed during refresh',
        );
        return;
      }
      await tx.knowledgeSourceVersion.updateMany({
        where: {
          id: { not: state.versionId },
          isCurrent: true,
          isDeleted: false,
          organizationId: state.organizationId,
          sourceId: state.sourceId,
        },
        data: {
          isCurrent: false,
          retrievalState: KnowledgeRetrievalState.SUPERSEDED,
          supersededByVersionId: state.versionId,
        },
      });
      await tx.knowledgeSourceVersion.updateMany({
        where: scopedWhere(state.organizationId, {
          id: state.versionId,
          sourceId: state.sourceId,
        }),
        data: { isCurrent: true },
      });
      await softDeleteKnowledgeChunks(tx, state.organizationId, {
        exceptVersionId: state.versionId,
        sourceId: state.sourceId,
      });
      await tx.knowledgeSourceRefreshRun.updateMany({
        where: scopedWhere(state.organizationId, {
          id: run.id,
          sourceId: state.sourceId,
        }),
        data: {
          completedAt: now,
          outcome: KnowledgeRefreshRunOutcome.CHANGED,
          status: KnowledgeRefreshRunStatus.COMPLETED,
        },
      });
      await this.writeSuccessfulRefreshSource(tx, state, now);
      await tx.knowledgeCaptureRequest.updateMany({
        where: scopedWhere(state.organizationId, {
          sourceId: state.sourceId,
          status: 'queued',
        }),
        data: { status: 'completed' },
      });
    });
  }

  private async failRefreshCandidate(
    state: KnowledgeSourceIngestState,
    error: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.writeFailedRefreshRun(tx, state, now, error);
      await tx.knowledgeCaptureRequest.updateMany({
        where: scopedWhere(state.organizationId, {
          sourceId: state.sourceId,
          status: 'queued',
        }),
        data: { error, status: 'failed' },
      });
    });
  }

  private async writeSuccessfulRefreshSource(
    tx: Prisma.TransactionClient,
    state: KnowledgeSourceIngestState,
    now: Date,
  ): Promise<void> {
    const source = await tx.knowledgeSource.findFirst({
      where: scopedWhere(state.organizationId, { id: state.sourceId }),
    });
    const intervalMinutes =
      source?.refreshIntervalMinutes ??
      (source?.kind === KnowledgeSourceKind.RSS ? 60 : 1_440);
    await tx.knowledgeSource.updateMany({
      where: scopedWhere(state.organizationId, { id: state.sourceId }),
      data: {
        consecutiveFailures: 0,
        firstFailureAt: null,
        lastCheckedAt: now,
        lastSuccessfulSyncAt: now,
        lastSyncError: null,
        nextCheckAt: new Date(now.getTime() + intervalMinutes * 60_000),
        staleAt: null,
        syncState: KnowledgeSourceSyncState.CURRENT,
      },
    });
  }

  private async writeFailedRefreshRun(
    tx: Prisma.TransactionClient,
    state: KnowledgeSourceIngestState,
    now: Date,
    error: string,
  ): Promise<void> {
    const source = await tx.knowledgeSource.findFirst({
      where: scopedWhere(state.organizationId, { id: state.sourceId }),
    });
    const consecutiveFailures = (source?.consecutiveFailures ?? 0) + 1;
    const firstFailureAt = source?.firstFailureAt ?? now;
    const graceMinutes = source?.gracePeriodMinutes ?? 10_080;
    const isStale =
      consecutiveFailures >= 2 &&
      now.getTime() - firstFailureAt.getTime() >= graceMinutes * 60_000;
    const backoffMinutes = Math.min(
      [15, 30, 60, 120][Math.min(consecutiveFailures - 1, 3)] ?? 120,
      source?.refreshIntervalMinutes ??
        (source?.kind === KnowledgeSourceKind.RSS ? 60 : 1_440),
    );
    await tx.knowledgeSourceRefreshRun.updateMany({
      where: scopedWhere(state.organizationId, {
        candidateVersionId: state.versionId,
        sourceId: state.sourceId,
        status: {
          in: [
            KnowledgeRefreshRunStatus.QUEUED,
            KnowledgeRefreshRunStatus.PROCESSING,
          ],
        },
      }),
      data: {
        completedAt: now,
        error,
        nextAttemptAt: new Date(now.getTime() + backoffMinutes * 60_000),
        status: KnowledgeRefreshRunStatus.FAILED,
      },
    });
    await tx.knowledgeSource.updateMany({
      where: scopedWhere(state.organizationId, { id: state.sourceId }),
      data: {
        consecutiveFailures,
        firstFailureAt,
        lastCheckedAt: now,
        lastSyncError: error,
        nextCheckAt: new Date(now.getTime() + backoffMinutes * 60_000),
        staleAt: isStale ? now : source?.staleAt,
        syncState: isStale
          ? KnowledgeSourceSyncState.STALE
          : KnowledgeSourceSyncState.FAILED,
      },
    });
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

  /**
   * Settle the capture requests that led to this current-version ingest, so
   * only later refresh-mode requests are still queued when a refresh
   * candidate succeeds or fails.
   */
  private async settleCaptureRequests(
    state: KnowledgeSourceIngestState,
    status: 'completed' | 'failed',
    error?: string,
  ): Promise<void> {
    await this.prisma.knowledgeCaptureRequest.updateMany({
      where: scopedWhere(state.organizationId, {
        sourceId: state.sourceId,
        status: 'queued',
      }),
      data: status === 'failed' ? { error, status } : { status },
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
