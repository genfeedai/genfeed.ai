import { hashToken } from '@api/auth/shared/pkce.util';
import { CLIP_ANALYSIS_WORKFLOW_ID } from '@api/collections/clip-projects/services/clip-analysis-workflow-definition';
import { generateClipSrt } from '@api/collections/clip-projects/services/clip-srt.util';
import {
  PUBLIC_LONG_FORM_ORGANIZATION_ID,
  PUBLIC_LONG_FORM_USER_ID,
  YOUTUBE_LONG_FORM_ACTION_IDS,
} from '@api/collections/workflows/services/youtube-long-form-workflow.service';
import {
  isYoutubeSourceUnavailableError,
  normalizeYoutubeUrl,
  YOUTUBE_SOURCE_UNAVAILABLE_DETAIL,
  YOUTUBE_URL_UNSUPPORTED_DETAIL,
} from '@api/collections/workflows/services/youtube-url.util';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import {
  PublicClipToolStoreService,
  type StoredPublicYoutubeClipSession,
} from '@api/services/public-clip-tool/public-clip-tool-store.service';
import { createGenfeedActionNode } from '@genfeedai/actions';
import { JobState } from '@genfeedai/contracts';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';
import type {
  IPublicYoutubeClipRecommendation,
  IPublicYoutubeClipToolSession,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  GoneException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

const MAX_FREE_RECOMMENDATIONS = 3;
const MIN_IDEMPOTENCY_KEY_LENGTH = 8;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;
const PUBLIC_YOUTUBE_CLIP_CREATE_WORKFLOW_ID = 'public-youtube-clip.create';
const PUBLIC_YOUTUBE_CLIP_READ_WORKFLOW_ID = 'public-youtube-clip.read';
const PUBLIC_YOUTUBE_CLIP_PREVIEW_WORKFLOW_ID = 'public-youtube-clip.preview';
const PUBLIC_YOUTUBE_CLIP_SESSION_GONE_CODE =
  'public_youtube_clip_expired_or_claimed';

const PUBLIC_YOUTUBE_CLIP_ACTION_IDS = {
  CREATE_SESSION: 'youtube.clip.create-session',
  DISPATCH_PREVIEW: 'youtube.clip.dispatch-preview',
  READ_SESSION: 'youtube.clip.read-session',
  RELEASE_SESSION: 'youtube.clip.release-session',
  RESERVE_PREVIEW: 'youtube.clip.reserve-preview',
} as const;

type PublicYoutubeSource = {
  title: string;
  videoId: string;
  youtubeUrl: string;
};

type PublicYoutubeClipSessionEnvelope = {
  analysisJobs: Array<{
    highlightFallback: 'deterministic';
    highlightModel: string;
    language: string;
    maxClips: number;
    minViralityScore: number;
    orgId: string;
    projectId: string;
    userId: string;
    youtubeUrl: string;
  }>;
  idempotencyKey?: string;
  isNew: boolean;
  previewToken: string;
  session: StoredPublicYoutubeClipSession;
  source: PublicYoutubeSource;
};

type PublicYoutubeClipPreviewEnvelope = {
  highlight: StoredPublicYoutubeClipSession['highlights'][number];
  jobId: string;
  previewToken: string;
  reserved: StoredPublicYoutubeClipSession;
};

@Injectable()
export class PublicYoutubeClipsService implements OnModuleInit {
  constructor(
    private readonly fileQueueService: FileQueueService,
    private readonly logger: LoggerService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly store: PublicClipToolStoreService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      PUBLIC_YOUTUBE_CLIP_ACTION_IDS.CREATE_SESSION,
      (request) => this.createSessionAction(request),
    );
    this.runner.registerAction(
      PUBLIC_YOUTUBE_CLIP_ACTION_IDS.READ_SESSION,
      (request) => this.readSessionAction(request),
    );
    this.runner.registerAction(
      PUBLIC_YOUTUBE_CLIP_ACTION_IDS.RELEASE_SESSION,
      (request) => this.releaseSessionAction(request),
    );
    this.runner.registerAction(
      PUBLIC_YOUTUBE_CLIP_ACTION_IDS.RESERVE_PREVIEW,
      (request) => this.reservePreviewAction(request),
    );
    this.runner.registerAction(
      PUBLIC_YOUTUBE_CLIP_ACTION_IDS.DISPATCH_PREVIEW,
      (request) => this.dispatchPreviewAction(request),
    );

    this.runner.registerWorkflow({
      canonicalId: PUBLIC_YOUTUBE_CLIP_CREATE_WORKFLOW_ID,
      definition: {
        edges: [
          {
            id: 'source-to-session',
            source: 'resolve-source',
            target: 'create-session',
            targetHandle: 'source',
          },
          {
            id: 'session-to-analysis-items',
            source: 'create-session',
            sourceHandle: 'analysisJobs',
            target: 'schedule-analysis',
            targetHandle: 'items',
          },
          {
            id: 'session-to-response',
            source: 'create-session',
            sourceHandle: 'previewToken',
            target: 'read-session',
            targetHandle: 'previewToken',
          },
          {
            id: 'analysis-to-response',
            source: 'schedule-analysis',
            target: 'read-session',
            targetHandle: 'analysisDispatch',
          },
          {
            id: 'analysis-failure-to-release',
            source: 'schedule-analysis',
            sourceHandle: 'failure',
            target: 'release-session',
            targetHandle: 'failure',
          },
        ],
        inputVariables: [
          {
            key: 'youtubeUrl',
            label: 'YouTube URL',
            required: true,
            type: 'string',
          },
          {
            key: 'idempotencyKey',
            label: 'Idempotency key',
            required: false,
            type: 'string',
          },
        ],
        nodes: [
          this.actionNode(
            'resolve-source',
            YOUTUBE_LONG_FORM_ACTION_IDS.RESOLVE_SOURCE,
            'Resolve YouTube source',
            ['youtubeUrl'],
            0,
          ),
          this.actionNode(
            'create-session',
            PUBLIC_YOUTUBE_CLIP_ACTION_IDS.CREATE_SESSION,
            'Create clip session',
            ['idempotencyKey'],
            280,
          ),
          createGenfeedActionNode({
            actionId: 'workflow.for-each',
            id: 'schedule-analysis',
            parameters: {
              childWorkflowId: CLIP_ANALYSIS_WORKFLOW_ID,
              itemInputKey: 'job',
              maxConcurrency: 1,
              mode: 'scheduled',
            },
            position: { x: 0, y: 560 },
          }),
          this.actionNode(
            'read-session',
            PUBLIC_YOUTUBE_CLIP_ACTION_IDS.READ_SESSION,
            'Read clip session',
            [],
            840,
          ),
          this.actionNode(
            'release-session',
            PUBLIC_YOUTUBE_CLIP_ACTION_IDS.RELEASE_SESSION,
            'Release failed clip session',
            [],
            840,
          ),
        ],
      },
      description:
        'Resolves a YouTube source, creates an idempotent session, and dispatches clip analysis.',
      label: 'Public YouTube Clip Creation',
      resultNodeId: 'read-session',
      version: 1,
    });
    this.runner.registerWorkflow({
      canonicalId: PUBLIC_YOUTUBE_CLIP_READ_WORKFLOW_ID,
      definition: {
        edges: [],
        inputVariables: [
          {
            key: 'previewToken',
            label: 'Preview token',
            required: true,
            type: 'string',
          },
        ],
        nodes: [
          this.actionNode(
            'read-session',
            PUBLIC_YOUTUBE_CLIP_ACTION_IDS.READ_SESSION,
            'Read clip session',
            ['previewToken'],
            0,
          ),
        ],
      },
      description:
        'Reads one public YouTube clip session through the workflow engine.',
      label: 'Public YouTube Clip Read',
      resultNodeId: 'read-session',
      version: 1,
    });
    this.runner.registerWorkflow({
      canonicalId: PUBLIC_YOUTUBE_CLIP_PREVIEW_WORKFLOW_ID,
      definition: {
        edges: [
          {
            id: 'reservation-to-dispatch',
            source: 'reserve-preview',
            target: 'dispatch-preview',
            targetHandle: 'previewEnvelope',
          },
        ],
        inputVariables: [
          {
            key: 'previewToken',
            label: 'Preview token',
            required: true,
            type: 'string',
          },
          {
            key: 'recommendationId',
            label: 'Recommendation ID',
            required: false,
            type: 'string',
          },
        ],
        nodes: [
          this.actionNode(
            'reserve-preview',
            PUBLIC_YOUTUBE_CLIP_ACTION_IDS.RESERVE_PREVIEW,
            'Reserve clip preview',
            ['previewToken', 'recommendationId'],
            0,
          ),
          this.actionNode(
            'dispatch-preview',
            PUBLIC_YOUTUBE_CLIP_ACTION_IDS.DISPATCH_PREVIEW,
            'Dispatch clip preview',
            [],
            280,
          ),
        ],
      },
      description: 'Reserves and dispatches one public YouTube clip preview.',
      label: 'Public YouTube Clip Preview',
      resultNodeId: 'dispatch-preview',
      version: 1,
    });
  }

  async create(
    youtubeUrl: string,
    idempotencyKey?: string,
  ): Promise<IPublicYoutubeClipToolSession> {
    const normalizedYoutubeUrl = normalizeYoutubeUrl(youtubeUrl);
    if (!normalizedYoutubeUrl) {
      throw new BadRequestException({
        code: 'public_youtube_clip_url_unsupported',
        detail: YOUTUBE_URL_UNSUPPORTED_DETAIL,
        title: 'Bad Request',
      });
    }
    const normalizedIdempotencyKey =
      this.normalizeIdempotencyKey(idempotencyKey);
    try {
      const { result } =
        await this.runner.runWorkflow<IPublicYoutubeClipToolSession>({
          actionType: 'public-youtube-clip-create',
          canonicalId: PUBLIC_YOUTUBE_CLIP_CREATE_WORKFLOW_ID,
          inputValues: {
            ...(normalizedIdempotencyKey
              ? { idempotencyKey: normalizedIdempotencyKey }
              : {}),
            youtubeUrl: normalizedYoutubeUrl.normalizedUrl,
          },
          metadata: { origin: 'website-free-tool' },
          organizationId: PUBLIC_LONG_FORM_ORGANIZATION_ID,
          source: 'PublicYoutubeClipsService.create',
          userId: PUBLIC_LONG_FORM_USER_ID,
        });
      return result;
    } catch (error) {
      if (this.hasErrorCode(error, PUBLIC_YOUTUBE_CLIP_SESSION_GONE_CODE)) {
        throw this.expiredSession();
      }
      if (isYoutubeSourceUnavailableError(error)) {
        throw new BadRequestException({
          code: 'public_youtube_clip_source_unavailable',
          detail: YOUTUBE_SOURCE_UNAVAILABLE_DETAIL,
          title: 'Bad Request',
        });
      }
      throw error;
    }
  }

  async read(previewToken: string): Promise<IPublicYoutubeClipToolSession> {
    try {
      const { result } =
        await this.runner.runWorkflow<IPublicYoutubeClipToolSession>({
          actionType: 'public-youtube-clip-read',
          canonicalId: PUBLIC_YOUTUBE_CLIP_READ_WORKFLOW_ID,
          inputValues: { previewToken },
          metadata: { origin: 'website-free-tool' },
          organizationId: PUBLIC_LONG_FORM_ORGANIZATION_ID,
          source: 'PublicYoutubeClipsService.read',
          userId: PUBLIC_LONG_FORM_USER_ID,
        });
      return result;
    } catch (error) {
      if (this.hasErrorCode(error, PUBLIC_YOUTUBE_CLIP_SESSION_GONE_CODE)) {
        throw this.expiredSession();
      }
      throw error;
    }
  }

  async requestPreview(
    previewToken: string,
    requestedRecommendationId?: string,
  ): Promise<IPublicYoutubeClipToolSession> {
    try {
      const { result } =
        await this.runner.runWorkflow<IPublicYoutubeClipToolSession>({
          actionType: 'public-youtube-clip-preview',
          canonicalId: PUBLIC_YOUTUBE_CLIP_PREVIEW_WORKFLOW_ID,
          inputValues: {
            previewToken,
            recommendationId: requestedRecommendationId,
          },
          metadata: { origin: 'website-free-tool' },
          organizationId: PUBLIC_LONG_FORM_ORGANIZATION_ID,
          source: 'PublicYoutubeClipsService.requestPreview',
          userId: PUBLIC_LONG_FORM_USER_ID,
        });
      return result;
    } catch (error) {
      if (this.hasErrorCode(error, PUBLIC_YOUTUBE_CLIP_SESSION_GONE_CODE)) {
        throw this.expiredSession();
      }
      throw error;
    }
  }

  private async createSessionAction(
    request: SystemWorkflowActionRequest,
  ): Promise<PublicYoutubeClipSessionEnvelope> {
    const source = this.readSource(request.input.source);
    const idempotencyKey =
      typeof request.input.idempotencyKey === 'string'
        ? request.input.idempotencyKey
        : undefined;
    const created = await this.store.createSession({
      ...(idempotencyKey ? { idempotencyKey } : {}),
      language: 'en',
      sourceFingerprint: hashToken(source.youtubeUrl),
      sourceVideoUrl: source.youtubeUrl,
    });
    return {
      analysisJobs: created.isNew
        ? [
            {
              highlightFallback: 'deterministic',
              highlightModel: AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE,
              language: created.session.language,
              maxClips: MAX_FREE_RECOMMENDATIONS,
              minViralityScore: 0,
              orgId: PUBLIC_LONG_FORM_ORGANIZATION_ID,
              projectId: this.store.toWorkerProjectId(created.previewToken),
              userId: PUBLIC_LONG_FORM_USER_ID,
              youtubeUrl: source.youtubeUrl,
            },
          ]
        : [],
      ...(idempotencyKey ? { idempotencyKey } : {}),
      isNew: created.isNew,
      previewToken: created.previewToken,
      session: created.session,
      source,
    };
  }

  private async readSessionAction(
    request: SystemWorkflowActionRequest,
  ): Promise<IPublicYoutubeClipToolSession> {
    const previewToken = this.requiredString(
      request.input.previewToken,
      'previewToken',
    );
    return this.withSessionGoneMarker(async () => {
      let session = await this.store.getSession(previewToken);
      session = await this.reconcilePreview(previewToken, session);
      return this.toResponse(previewToken, session);
    });
  }

  private async releaseSessionAction(
    request: SystemWorkflowActionRequest,
  ): Promise<{ previewToken?: string; released: boolean }> {
    const failure = this.readRecord(request.input.failure);
    const nodeOutputs = this.readRecord(failure.nodeOutputs);
    const envelope = this.readRecord(nodeOutputs['create-session']);
    if (envelope.isNew !== true) {
      return { released: false };
    }
    const previewToken = this.requiredString(
      envelope.previewToken,
      'failure.nodeOutputs.create-session.previewToken',
    );
    const session = this.readRecord(envelope.session);
    const sourceFingerprint = this.requiredString(
      session.sourceFingerprint,
      'failure.nodeOutputs.create-session.session.sourceFingerprint',
    );
    const idempotencyKey = this.readString(envelope.idempotencyKey);
    await this.store.releaseFailedSession(
      previewToken,
      sourceFingerprint,
      idempotencyKey,
    );
    return { previewToken, released: true };
  }

  private async reservePreviewAction(
    request: SystemWorkflowActionRequest,
  ): Promise<PublicYoutubeClipPreviewEnvelope> {
    const previewToken = this.requiredString(
      request.input.previewToken,
      'previewToken',
    );
    return this.withSessionGoneMarker(async () => {
      const current = await this.store.getSession(previewToken);
      const recommendationId =
        (typeof request.input.recommendationId === 'string'
          ? request.input.recommendationId
          : undefined) ?? current.highlights[0]?.id;
      if (!recommendationId) {
        throw this.noRecommendation();
      }
      const jobId = `public-youtube-preview-${current.id}`;
      const reserved = await this.store.reservePreview(
        previewToken,
        recommendationId,
        jobId,
      );
      const highlight = reserved.highlights.find(
        (candidate) => candidate.id === recommendationId,
      );
      if (!highlight) {
        throw this.noRecommendation();
      }
      return { highlight, jobId, previewToken, reserved };
    });
  }

  private async dispatchPreviewAction(
    request: SystemWorkflowActionRequest,
  ): Promise<IPublicYoutubeClipToolSession> {
    const envelope = this.readPreviewEnvelope(request.input.previewEnvelope);
    const { highlight, jobId, previewToken, reserved } = envelope;
    try {
      const response = await this.fileQueueService.processVideo({
        id: jobId,
        ingredientId: jobId,
        organizationId: PUBLIC_LONG_FORM_ORGANIZATION_ID,
        params: {
          captionContent: generateClipSrt(
            reserved.transcriptSegments,
            highlight.start_time,
            highlight.end_time,
          ),
          endTime: highlight.end_time,
          ...(reserved.sourceVideoS3Key
            ? { s3Key: reserved.sourceVideoS3Key }
            : { inputPath: reserved.sourceVideoUrl }),
          startTime: highlight.start_time,
        },
        type: 'clip-trim',
        userId: PUBLIC_LONG_FORM_USER_ID,
      });
      const updated = await this.withSessionGoneMarker(() =>
        this.store.patchByToken(previewToken, {
          preview: {
            jobId: response.jobId || jobId,
            recommendationId: highlight.id,
            status: 'generating',
          },
        }),
      );
      return this.toResponse(previewToken, updated);
    } catch (error) {
      if (this.hasErrorCode(error, PUBLIC_YOUTUBE_CLIP_SESSION_GONE_CODE)) {
        throw error;
      }
      this.logger.warn('Public YouTube preview dispatch failed', {
        code: 'public_youtube_preview_dispatch_failed',
        error,
        sessionId: reserved.id,
      });
      const failed = await this.withSessionGoneMarker(() =>
        this.store.patchByToken(previewToken, {
          preview: { recommendationId: highlight.id, status: 'failed' },
        }),
      );
      return this.toResponse(previewToken, failed);
    }
  }

  private async reconcilePreview(
    previewToken: string,
    session: StoredPublicYoutubeClipSession,
  ): Promise<StoredPublicYoutubeClipSession> {
    const jobId = session.preview.jobId;
    if (!jobId || !['generating', 'queued'].includes(session.preview.status)) {
      return session;
    }

    try {
      const status = await this.fileQueueService.getJobStatus(jobId);
      if (status.state === JobState.FAILED) {
        return this.store.patchByToken(previewToken, {
          preview: {
            recommendationId: session.preview.recommendationId,
            status: 'failed',
          },
        });
      }
      if (status.state !== JobState.COMPLETED) {
        return session;
      }

      const result = this.readRecord(status.result);
      const url =
        this.readString(result.url) ?? this.readString(result.outputUrl);
      if (!url) {
        return this.store.patchByToken(previewToken, {
          preview: {
            recommendationId: session.preview.recommendationId,
            status: 'failed',
          },
        });
      }

      return this.store.patchByToken(previewToken, {
        preview: {
          recommendationId: session.preview.recommendationId,
          s3Key: this.readString(result.s3Key),
          status: 'ready',
          url,
        },
      });
    } catch (error) {
      this.logger.warn('Public YouTube preview status unavailable', {
        code: 'public_youtube_preview_status_unavailable',
        error,
        sessionId: session.id,
      });
      return session;
    }
  }

  private toResponse(
    previewToken: string,
    session: StoredPublicYoutubeClipSession,
  ): IPublicYoutubeClipToolSession {
    return {
      ...(session.status === 'failed'
        ? { errorCode: 'public_youtube_clip_processing_failed' }
        : {}),
      expiresAt: session.expiresAt,
      id: session.id,
      preview: {
        ...(session.preview.recommendationId
          ? { recommendationId: session.preview.recommendationId }
          : {}),
        status: session.preview.status,
        ...(session.preview.url ? { url: session.preview.url } : {}),
      },
      previewToken,
      progress: session.progress,
      recommendations: session.highlights
        .slice(0, MAX_FREE_RECOMMENDATIONS)
        .map(
          (highlight): IPublicYoutubeClipRecommendation => ({
            clipType: highlight.clip_type,
            endTime: highlight.end_time,
            id: highlight.id,
            score: highlight.virality_score,
            startTime: highlight.start_time,
            summary: highlight.summary,
            tags: highlight.tags,
            title: highlight.title,
          }),
        ),
      status: session.status,
      transcript: session.transcriptSegments,
    };
  }

  private normalizeIdempotencyKey(value?: string): string | undefined {
    const key = value?.trim();
    if (!key) {
      return undefined;
    }
    if (
      key.length < MIN_IDEMPOTENCY_KEY_LENGTH ||
      key.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
      !IDEMPOTENCY_KEY_PATTERN.test(key)
    ) {
      throw new BadRequestException({
        code: 'public_youtube_clip_idempotency_key_invalid',
        detail: 'The idempotency key is invalid.',
        title: 'Bad Request',
      });
    }
    return key;
  }

  private expiredSession(): GoneException {
    return new GoneException({
      code: PUBLIC_YOUTUBE_CLIP_SESSION_GONE_CODE,
      detail: 'This free-tool session has expired or was already claimed.',
      title: 'Gone',
    });
  }

  private hasErrorCode(error: unknown, code: string): boolean {
    return error instanceof Error && error.message.includes(`[${code}]`);
  }

  private async withSessionGoneMarker<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof GoneException) {
        throw new Error(`[${PUBLIC_YOUTUBE_CLIP_SESSION_GONE_CODE}]`);
      }
      throw error;
    }
  }

  private noRecommendation(): BadRequestException {
    return new BadRequestException({
      code: 'public_youtube_clip_no_recommendation',
      detail: 'No eligible clip recommendation is available for preview.',
      title: 'Bad Request',
    });
  }

  private actionNode(
    id: string,
    actionId: string,
    label: string,
    inputVariableKeys: string[],
    x: number,
  ) {
    return createGenfeedActionNode({
      actionId,
      id,
      position: { x, y: 120 },
      inputVariableKeys,
      label,
    });
  }

  private readSource(value: unknown): PublicYoutubeSource {
    const record = this.readRecord(value);
    return {
      title: this.requiredString(record.title, 'source.title'),
      videoId: this.requiredString(record.videoId, 'source.videoId'),
      youtubeUrl: this.requiredString(record.youtubeUrl, 'source.youtubeUrl'),
    };
  }

  private readPreviewEnvelope(
    value: unknown,
  ): PublicYoutubeClipPreviewEnvelope {
    const record = this.readRecord(value);
    return {
      highlight: this.readRecord(
        record.highlight,
      ) as unknown as PublicYoutubeClipPreviewEnvelope['highlight'],
      jobId: this.requiredString(record.jobId, 'jobId'),
      previewToken: this.requiredString(record.previewToken, 'previewToken'),
      reserved: this.readRecord(
        record.reserved,
      ) as unknown as StoredPublicYoutubeClipSession,
    };
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Missing required public clip action input: ${field}`);
    }
    return value.trim();
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
