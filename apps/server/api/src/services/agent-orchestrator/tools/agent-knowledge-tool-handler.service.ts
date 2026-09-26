import { KnowledgeCaptureService } from '@api/collections/contexts/services/knowledge-capture.service';
import { KnowledgeContentRetrievalService } from '@api/collections/contexts/services/knowledge-content-retrieval.service';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { resolveKnowledgeMinRelevance } from '@api/collections/contexts/utils/knowledge-source.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import type {
  KnowledgeSource,
  KnowledgeSourceVersion,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type KnowledgeToolName =
  | 'archive_knowledge_source'
  | 'assign_knowledge_purpose'
  | 'capture_knowledge'
  | 'list_knowledge_sources'
  | 'read_knowledge_source'
  | 'retry_knowledge_ingestion'
  | 'search_knowledge';

const SEARCH_DEFAULT_LIMIT = 6;
const SEARCH_MAX_LIMIT = 12;
const SEARCH_MIN_RELEVANCE = 0.6;
const LIST_DEFAULT_LIMIT = 25;
const LIST_MAX_LIMIT = 100;
const PREVIEW_LENGTH = 1500;

type KnowledgeActor = {
  brandId?: string;
  isWorkflowScoped?: boolean;
  organizationId: string;
  userId: string;
};

function toActor(ctx: ToolExecutionContext): KnowledgeActor {
  return {
    ...(ctx.brandId ? { brandId: ctx.brandId } : {}),
    ...(ctx.isWorkflowScoped ? { isWorkflowScoped: true } : {}),
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  };
}

function readPurpose(value: unknown): KnowledgeSourcePurpose | undefined {
  return typeof value === 'string' &&
    Object.values(KnowledgeSourcePurpose).includes(
      value as KnowledgeSourcePurpose,
    )
    ? (value as KnowledgeSourcePurpose)
    : undefined;
}

function readProcessingState(
  value: unknown,
): KnowledgeProcessingState | undefined {
  return typeof value === 'string' &&
    Object.values(KnowledgeProcessingState).includes(
      value as KnowledgeProcessingState,
    )
    ? (value as KnowledgeProcessingState)
    : undefined;
}

function readPurposes(value: unknown): KnowledgeSourcePurpose[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const purposes = value
    .map(readPurpose)
    .filter((purpose): purpose is KnowledgeSourcePurpose => Boolean(purpose));
  return purposes.length > 0 ? purposes : undefined;
}

function readBoundedInt(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'number' ? Math.floor(value) : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function readStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter(
    (item): item is string => typeof item === 'string' && item.trim() !== '',
  );
  return items.length > 0 ? items : undefined;
}

function summarizeSource(
  source: KnowledgeSource,
  version?: KnowledgeSourceVersion | null,
): Record<string, unknown> {
  return {
    brandId: source.brandId,
    id: source.id,
    isVisible: source.isVisible,
    kind: source.kind,
    ...(version
      ? {
          observedAt: version.observedAt.toISOString(),
          processingError: version.processingError,
          processingState: version.processingState,
          retrievalState: version.retrievalState,
          version: version.version,
          versionId: version.id,
        }
      : {}),
    purpose: source.purpose,
    scope: source.scope,
    title: source.title,
  };
}

function readText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const text = (payload as { text?: unknown }).text;
  return typeof text === 'string' && text.trim() ? text : undefined;
}

/**
 * Brand Knowledge actions for the Agent and MCP surfaces. Tenant and brand
 * come from the execution context; ids in parameters only narrow within it.
 */
@Injectable()
export class AgentKnowledgeToolHandler {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly records: KnowledgeRecordsService,
    private readonly capture: KnowledgeCaptureService,
    private readonly knowledgeContentRetrievalService: KnowledgeContentRetrievalService,
  ) {}

  /** Single dispatch entry so the executor's route table stays flat. */
  execute(
    toolName: KnowledgeToolName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case 'search_knowledge':
        return this.searchKnowledge(params, ctx);
      case 'list_knowledge_sources':
        return this.listKnowledgeSources(params, ctx);
      case 'read_knowledge_source':
        return this.readKnowledgeSource(params, ctx);
      case 'capture_knowledge':
        return this.captureKnowledge(params, ctx);
      case 'assign_knowledge_purpose':
        return this.assignKnowledgePurpose(params, ctx);
      case 'archive_knowledge_source':
        return this.archiveKnowledgeSource(params, ctx);
      case 'retry_knowledge_ingestion':
        return this.retryKnowledgeIngestion(params, ctx);
    }
  }

  async searchKnowledge(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const query = readOptionalString(params.query)?.trim();
    if (!query) {
      return { creditsUsed: 0, error: 'query is required', success: false };
    }
    const brandId = readOptionalString(params.brandId) ?? ctx.brandId;
    if (!brandId) {
      return {
        creditsUsed: 0,
        error:
          'Select a brand before searching its Knowledge. Pass brandId from list_brands.',
        success: false,
      };
    }
    if (Array.isArray(params.sourceIds) && params.sourceIds.length === 0) {
      return {
        creditsUsed: 0,
        data: {
          message:
            'No saved Knowledge matched. Capture a source first or broaden the query.',
          passages: [],
          query,
        },
        success: true,
      };
    }
    const sourceIds = readStringList(params.sourceIds);
    if (sourceIds && ctx.isWorkflowScoped) {
      await this.records.assertSourcesInScope(toActor(ctx), sourceIds);
    }
    const hits =
      await this.knowledgeContentRetrievalService.retrieveBrandContentMemory({
        brandId,
        knowledgePurposes: readPurposes(params.purposes),
        knowledgeSourceIds: sourceIds,
        limit: readBoundedInt(
          params.limit,
          SEARCH_DEFAULT_LIMIT,
          SEARCH_MAX_LIMIT,
        ),
        minRelevance: resolveKnowledgeMinRelevance(
          sourceIds,
          SEARCH_MIN_RELEVANCE,
        ),
        organizationId: ctx.organizationId,
        query,
      });
    const passages = hits
      .filter((hit) => hit.citation)
      .map((hit) => ({
        citation: hit.citation,
        content: hit.content,
        relevance: hit.relevance,
      }));
    return {
      creditsUsed: 0,
      data: {
        message:
          passages.length === 0
            ? 'No saved Knowledge matched. Capture a source first or broaden the query.'
            : `${passages.length} cited passage${passages.length === 1 ? '' : 's'} found.`,
        passages,
        query,
      },
      success: true,
    };
  }

  async listKnowledgeSources(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const actor = toActor(ctx);
    const page = readBoundedInt(params.page, 1, Number.MAX_SAFE_INTEGER);
    const limit = readBoundedInt(
      params.limit,
      LIST_DEFAULT_LIMIT,
      LIST_MAX_LIMIT,
    );
    const result = await this.records.listSources(actor, page, limit, {
      processingState: readProcessingState(params.processingState),
      purpose: readPurpose(params.purpose),
    });
    const sources = await Promise.all(
      result.docs.map(async (source) => {
        const version = await this.records
          .getCurrentVersion(actor, source.id)
          .catch(() => null);
        return summarizeSource(source, version);
      }),
    );
    return {
      creditsUsed: 0,
      data: {
        limit,
        page,
        sources,
        total: result.totalDocs,
        totalPages: result.totalPages,
      },
      success: true,
    };
  }

  async readKnowledgeSource(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const sourceId = readOptionalString(params.sourceId);
    if (!sourceId) {
      return { creditsUsed: 0, error: 'sourceId is required', success: false };
    }
    const actor = toActor(ctx);
    const source = await this.records.getSource(actor, sourceId);
    const version = await this.records
      .getCurrentVersion(actor, sourceId)
      .catch(() => null);
    const spaces = await this.records.listSourceSpaces(actor, sourceId);
    const text = version ? readText(version.payload) : undefined;
    return {
      creditsUsed: 0,
      data: {
        ...summarizeSource(source, version),
        provenance: version?.provenance ?? null,
        spaces: spaces.map((space) => ({
          id: space.id,
          isInbox: space.isInbox,
          title: space.title,
        })),
        ...(text
          ? {
              isPreviewTruncated: text.length > PREVIEW_LENGTH,
              textPreview: text.slice(0, PREVIEW_LENGTH),
            }
          : {}),
      },
      success: true,
    };
  }

  async captureKnowledge(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const sourceId = readOptionalString(params.sourceId);
    const actor = toActor(ctx);
    if (sourceId) {
      const conflicting = ['title', 'kind', 'referenceUrl', 'text', 'purpose']
        .filter((key) => params[key] !== undefined)
        .join(', ');
      if (conflicting) {
        return {
          creditsUsed: 0,
          error: `Refresh capture forbids ${conflicting}`,
          success: false,
        };
      }
      const result = await this.capture.refreshExisting(
        actor,
        sourceId,
        {
          capturedAt: new Date().toISOString(),
          capturedBy: ctx.isWorkflowScoped ? 'workflow' : 'agent',
          ...(ctx.threadId ? { threadId: ctx.threadId } : {}),
        },
        ctx.scheduledFireJobId,
      );
      this.loggerService.log('Agent refreshed knowledge', {
        organizationId: ctx.organizationId,
        sourceId: result.source.id,
      });
      return {
        creditsUsed: 0,
        data: {
          ...summarizeSource(result.source, result.version),
          jobId: result.jobId,
          message:
            'Source refresh queued; it becomes searchable once ingestion succeeds.',
        },
        success: true,
      };
    }
    const title = readOptionalString(params.title)?.trim();
    const kind = readOptionalString(params.kind);
    if (!title || !kind) {
      return {
        creditsUsed: 0,
        error: 'title and kind are required',
        success: false,
      };
    }
    if (
      kind !== KnowledgeSourceKind.TEXT &&
      kind !== KnowledgeSourceKind.URL &&
      kind !== KnowledgeSourceKind.DOCUMENT &&
      kind !== KnowledgeSourceKind.RSS &&
      kind !== KnowledgeSourceKind.AUDIO &&
      kind !== KnowledgeSourceKind.VIDEO
    ) {
      return {
        creditsUsed: 0,
        error: 'kind must be TEXT, URL, DOCUMENT, RSS, AUDIO or VIDEO',
        success: false,
      };
    }
    const isMedia =
      kind === KnowledgeSourceKind.AUDIO || kind === KnowledgeSourceKind.VIDEO;
    const transcriptUrl = isMedia
      ? readOptionalString(params.transcriptUrl)
      : undefined;
    // Ingest reads transcript settings from the version payload, which is
    // built from these top-level DTO fields — never from provenance.
    const result = await this.capture.capture(actor, {
      kind,
      purpose:
        readPurpose(params.purpose) ?? KnowledgeSourcePurpose.INSPIRATION,
      referenceUrl: readOptionalString(params.referenceUrl),
      scope: actor.brandId
        ? KnowledgeMemoryScope.BRAND
        : KnowledgeMemoryScope.PERSONAL,
      text: readOptionalString(params.text),
      title,
      ...(isMedia && params.isTranscriptGenerationAllowed === true
        ? { isTranscriptGenerationAllowed: true }
        : {}),
      ...(transcriptUrl ? { transcriptUrl } : {}),
      provenance: {
        capturedBy: ctx.isWorkflowScoped ? 'workflow' : 'agent',
        ...(ctx.threadId ? { threadId: ctx.threadId } : {}),
      },
    });
    this.loggerService.log('Agent captured knowledge', {
      organizationId: ctx.organizationId,
      sourceId: result.source.id,
    });
    return {
      creditsUsed: 0,
      data: {
        ...summarizeSource(result.source, result.version),
        jobId: result.jobId,
        message: result.version
          ? 'Source saved; ingestion started. It becomes searchable once ready.'
          : 'Source saved without content; capture a version to make it searchable.',
      },
      success: true,
    };
  }

  async assignKnowledgePurpose(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const sourceId = readOptionalString(params.sourceId);
    if (!sourceId) {
      return { creditsUsed: 0, error: 'sourceId is required', success: false };
    }
    const purpose = readPurpose(params.purpose);
    const isVisible =
      typeof params.isVisible === 'boolean' ? params.isVisible : undefined;
    if (!purpose && isVisible === undefined) {
      return {
        creditsUsed: 0,
        error: 'Provide a purpose or isVisible to change',
        success: false,
      };
    }
    const actor = toActor(ctx);
    if (isVisible === false) {
      await this.capture.unscheduleRefresh(actor, sourceId);
    }
    const source = await this.records.updateSource(actor, sourceId, {
      ...(purpose ? { purpose } : {}),
      ...(isVisible !== undefined ? { isVisible } : {}),
    });
    return {
      creditsUsed: 0,
      data: summarizeSource(source),
      success: true,
    };
  }

  async archiveKnowledgeSource(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const sourceId = readOptionalString(params.sourceId);
    if (!sourceId) {
      return { creditsUsed: 0, error: 'sourceId is required', success: false };
    }
    const actor = toActor(ctx);
    await this.capture.unscheduleRefresh(actor, sourceId);
    const source = await this.records.deleteSource(actor, sourceId);
    return {
      creditsUsed: 0,
      data: { ...summarizeSource(source), message: 'Source archived.' },
      success: true,
    };
  }

  async retryKnowledgeIngestion(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const sourceId = readOptionalString(params.sourceId);
    if (!sourceId) {
      return { creditsUsed: 0, error: 'sourceId is required', success: false };
    }
    const result = await this.capture.retry(toActor(ctx), sourceId);
    return {
      creditsUsed: 0,
      data: {
        jobId: result.jobId,
        message:
          result.version.processingState === KnowledgeProcessingState.QUEUED
            ? 'Ingestion requeued.'
            : 'Ingestion requested.',
        sourceId,
        versionId: result.version.id,
      },
      success: true,
    };
  }
}
