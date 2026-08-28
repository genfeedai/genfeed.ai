import { ClipAnalyzeQueueService } from '@api/queues/clip-analyze/clip-analyze.queue.service';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/constants';
import { JobState } from '@genfeedai/enums';
import type {
  IPublicYoutubeClipRecommendation,
  IPublicYoutubeClipToolSession,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { hashToken } from '@server/auth/shared/pkce.util';
import { generateClipSrt } from '@server/collections/clip-projects/services/clip-srt.util';
import {
  PUBLIC_LONG_FORM_ORGANIZATION_ID,
  PUBLIC_LONG_FORM_USER_ID,
  YOUTUBE_LONG_FORM_ACTION_IDS,
} from '@server/collections/workflows/services/youtube-long-form-workflow.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { FileQueueService } from '@server/services/files-microservice/queue/file-queue.service';
import {
  PublicClipToolStoreService,
  type StoredPublicYoutubeClipSession,
} from '@server/services/public-clip-tool/public-clip-tool-store.service';

const MAX_FREE_RECOMMENDATIONS = 3;
const MIN_IDEMPOTENCY_KEY_LENGTH = 8;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;
const PUBLIC_YOUTUBE_CLIP_CREATE_WORKFLOW_ID = 'public-youtube-clip.create';
const PUBLIC_YOUTUBE_CLIP_READ_WORKFLOW_ID = 'public-youtube-clip.read';
const PUBLIC_YOUTUBE_CLIP_PREVIEW_WORKFLOW_ID = 'public-youtube-clip.preview';

const PUBLIC_YOUTUBE_CLIP_ACTION_IDS = {
  CREATE_SESSION: 'youtube.clip.create-session',
  DISPATCH_ANALYSIS: 'youtube.clip.dispatch-analysis',
  DISPATCH_PREVIEW: 'youtube.clip.dispatch-preview',
  READ_SESSION: 'youtube.clip.read-session',
  RESERVE_PREVIEW: 'youtube.clip.reserve-preview',
} as const;

type PublicYoutubeSource = {
  title: string;
  videoId: string;
  youtubeUrl: string;
};

type PublicYoutubeClipSessionEnvelope = {
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
    private readonly clipAnalyzeQueueService: ClipAnalyzeQueueService,
    private readonly fileQueueService: FileQueueService,
    private readonly logger: LoggerService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly store: PublicClipToolStoreService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      PUBLIC_YOUTUBE_CLIP_ACTION_IDS.CREATE_SESSION,
      (request) => this.createSessionAction(request),
      {
        description:
          'Creates or reuses one idempotent public YouTube clip session.',
        label: 'Create Public Clip Session',
      },
    );
    this.runner.registerAction(
      PUBLIC_YOUTUBE_CLIP_ACTION_IDS.DISPATCH_ANALYSIS,
      (request) => this.dispatchAnalysisAction(request),
      {
        description: 'Dispatches analysis for one new public clip session.',
        label: 'Dispatch Public Clip Analysis',
      },
    );
    this.runner.registerAction(
      PUBLIC_YOUTUBE_CLIP_ACTION_IDS.READ_SESSION,
      (request) => this.readSessionAction(request),
      {
        description:
          'Reads one public clip session and reconciles its preview state.',
        label: 'Read Public Clip Session',
      },
    );
    this.runner.registerAction(
      PUBLIC_YOUTUBE_CLIP_ACTION_IDS.RESERVE_PREVIEW,
      (request) => this.reservePreviewAction(request),
      {
        description: 'Reserves one clip recommendation for preview rendering.',
        label: 'Reserve Public Clip Preview',
      },
    );
    this.runner.registerAction(
      PUBLIC_YOUTUBE_CLIP_ACTION_IDS.DISPATCH_PREVIEW,
      (request) => this.dispatchPreviewAction(request),
      {
        description: 'Dispatches one reserved clip preview render.',
        label: 'Dispatch Public Clip Preview',
      },
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
            id: 'session-to-analysis',
            source: 'create-session',
            target: 'dispatch-analysis',
            targetHandle: 'sessionEnvelope',
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
          this.actionNode(
            'dispatch-analysis',
            PUBLIC_YOUTUBE_CLIP_ACTION_IDS.DISPATCH_ANALYSIS,
            'Dispatch clip analysis',
            [],
            560,
          ),
        ],
      },
      description:
        'Resolves a YouTube source, creates an idempotent session, and dispatches clip analysis.',
      label: 'Public YouTube Clip Creation',
      resultNodeId: 'dispatch-analysis',
      version: 1,
    });
    this.runner.registerWorkflow({
      canonicalId: PUBLIC_YOUTUBE_CLIP_READ_WORKFLOW_ID,
      definition: {
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
    const { result } =
      await this.runner.runWorkflow<IPublicYoutubeClipToolSession>({
        actionType: 'public-youtube-clip-create',
        canonicalId: PUBLIC_YOUTUBE_CLIP_CREATE_WORKFLOW_ID,
        inputValues: {
          idempotencyKey: this.normalizeIdempotencyKey(idempotencyKey),
          youtubeUrl,
        },
        metadata: { origin: 'website-free-tool' },
        organizationId: PUBLIC_LONG_FORM_ORGANIZATION_ID,
        source: 'PublicYoutubeClipsService.create',
        userId: PUBLIC_LONG_FORM_USER_ID,
      });
    return result;
  }

  async read(previewToken: string): Promise<IPublicYoutubeClipToolSession> {
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
  }

  async requestPreview(
    previewToken: string,
    requestedRecommendationId?: string,
  ): Promise<IPublicYoutubeClipToolSession> {
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
      idempotencyKey,
      language: 'en',
      sourceFingerprint: hashToken(source.youtubeUrl),
      sourceVideoUrl: source.youtubeUrl,
    });
    return {
      idempotencyKey,
      isNew: created.isNew,
      previewToken: created.previewToken,
      session: created.session,
      source,
    };
  }

  private async dispatchAnalysisAction(
    request: SystemWorkflowActionRequest,
  ): Promise<IPublicYoutubeClipToolSession> {
    const envelope = this.readSessionEnvelope(request.input.sessionEnvelope);
    if (envelope.isNew) {
      try {
        await this.clipAnalyzeQueueService.enqueue({
          highlightFallback: 'deterministic',
          highlightModel: AGENT_CHAT_MODEL_KEYS.OPENROUTER_FREE,
          language: envelope.session.language,
          maxClips: MAX_FREE_RECOMMENDATIONS,
          minViralityScore: 0,
          orgId: PUBLIC_LONG_FORM_ORGANIZATION_ID,
          projectId: this.store.toWorkerProjectId(envelope.previewToken),
          userId: PUBLIC_LONG_FORM_USER_ID,
          youtubeUrl: envelope.source.youtubeUrl,
        });
      } catch (error) {
        await this.store.releaseFailedSession(
          envelope.previewToken,
          envelope.session.sourceFingerprint,
          envelope.idempotencyKey,
        );
        this.logger.error('Public YouTube clip analysis enqueue failed', {
          code: 'public_youtube_clip_enqueue_failed',
          error,
        });
        throw new ServiceUnavailableException({
          code: 'public_youtube_clip_enqueue_unavailable',
          detail: 'The video could not be queued. Retry safely.',
          title: 'Service Unavailable',
        });
      }
    }
    return this.toResponse(envelope.previewToken, envelope.session);
  }

  private async readSessionAction(
    request: SystemWorkflowActionRequest,
  ): Promise<IPublicYoutubeClipToolSession> {
    const previewToken = this.requiredString(
      request.input.previewToken,
      'previewToken',
    );
    let session = await this.store.getSession(previewToken);
    session = await this.reconcilePreview(previewToken, session);
    return this.toResponse(previewToken, session);
  }

  private async reservePreviewAction(
    request: SystemWorkflowActionRequest,
  ): Promise<PublicYoutubeClipPreviewEnvelope> {
    const previewToken = this.requiredString(
      request.input.previewToken,
      'previewToken',
    );
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
      const updated = await this.store.patchByToken(previewToken, {
        preview: {
          jobId: response.jobId || jobId,
          recommendationId: highlight.id,
          status: 'generating',
        },
      });
      return this.toResponse(previewToken, updated);
    } catch (error) {
      this.logger.warn('Public YouTube preview dispatch failed', {
        code: 'public_youtube_preview_dispatch_failed',
        error,
        sessionId: reserved.id,
      });
      const failed = await this.store.patchByToken(previewToken, {
        preview: { recommendationId: highlight.id, status: 'failed' },
      });
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
    return {
      data: {
        config: { actionId, parameters: {} },
        inputVariableKeys,
        label,
      },
      id,
      position: { x, y: 120 },
      type: 'genfeedAction',
    };
  }

  private readSource(value: unknown): PublicYoutubeSource {
    const record = this.readRecord(value);
    return {
      title: this.requiredString(record.title, 'source.title'),
      videoId: this.requiredString(record.videoId, 'source.videoId'),
      youtubeUrl: this.requiredString(record.youtubeUrl, 'source.youtubeUrl'),
    };
  }

  private readSessionEnvelope(
    value: unknown,
  ): PublicYoutubeClipSessionEnvelope {
    const record = this.readRecord(value);
    return {
      idempotencyKey:
        typeof record.idempotencyKey === 'string'
          ? record.idempotencyKey
          : undefined,
      isNew: record.isNew === true,
      previewToken: this.requiredString(record.previewToken, 'previewToken'),
      session: this.readRecord(
        record.session,
      ) as unknown as StoredPublicYoutubeClipSession,
      source: this.readSource(record.source),
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
