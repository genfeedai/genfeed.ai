import { hashToken } from '@api/auth/shared/pkce.util';
import { generateClipSrt } from '@api/collections/clip-projects/services/clip-srt.util';
import { ClipAnalyzeQueueService } from '@api/queues/clip-analyze/clip-analyze.queue.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import {
  PublicClipToolStoreService,
  type StoredPublicYoutubeClipSession,
} from '@api/services/public-clip-tool/public-clip-tool-store.service';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/constants';
import { JobState } from '@genfeedai/enums';
import type {
  IPublicYoutubeClipRecommendation,
  IPublicYoutubeClipToolSession,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const MAX_FREE_RECOMMENDATIONS = 3;
const MIN_IDEMPOTENCY_KEY_LENGTH = 8;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;
const YOUTUBE_HOSTS = new Set([
  'youtu.be',
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
]);
const PUBLIC_FILE_ORGANIZATION_ID = 'system';
const PUBLIC_FILE_USER_ID = 'public-youtube-clip-tool';

@Injectable()
export class PublicYoutubeClipsService {
  constructor(
    private readonly clipAnalyzeQueueService: ClipAnalyzeQueueService,
    private readonly fileQueueService: FileQueueService,
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
    private readonly store: PublicClipToolStoreService,
  ) {}

  async create(
    youtubeUrl: string,
    idempotencyKey?: string,
  ): Promise<IPublicYoutubeClipToolSession> {
    const normalizedUrl = this.normalizeYoutubeUrl(youtubeUrl);
    const normalizedIdempotencyKey =
      this.normalizeIdempotencyKey(idempotencyKey);
    await this.assertVideoIsPublic(normalizedUrl);

    const created = await this.store.createSession({
      idempotencyKey: normalizedIdempotencyKey,
      language: 'en',
      sourceFingerprint: hashToken(normalizedUrl),
      sourceVideoUrl: normalizedUrl,
    });

    if (created.isNew) {
      try {
        await this.clipAnalyzeQueueService.enqueue({
          highlightFallback: 'deterministic',
          highlightModel: AGENT_CHAT_MODEL_KEYS.OPENROUTER_FREE,
          language: created.session.language,
          maxClips: MAX_FREE_RECOMMENDATIONS,
          minViralityScore: 0,
          orgId: PUBLIC_FILE_ORGANIZATION_ID,
          projectId: this.store.toWorkerProjectId(created.previewToken),
          userId: PUBLIC_FILE_USER_ID,
          youtubeUrl: normalizedUrl,
        });
      } catch (error) {
        await this.store.releaseFailedSession(
          created.previewToken,
          created.session.sourceFingerprint,
          normalizedIdempotencyKey,
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

    return this.toResponse(created.previewToken, created.session);
  }

  async read(previewToken: string): Promise<IPublicYoutubeClipToolSession> {
    let session = await this.store.getSession(previewToken);
    session = await this.reconcilePreview(previewToken, session);
    return this.toResponse(previewToken, session);
  }

  async requestPreview(
    previewToken: string,
    requestedRecommendationId?: string,
  ): Promise<IPublicYoutubeClipToolSession> {
    const current = await this.store.getSession(previewToken);
    const recommendationId =
      requestedRecommendationId ?? current.highlights[0]?.id;
    if (!recommendationId) {
      throw new BadRequestException({
        code: 'public_youtube_clip_no_recommendation',
        detail: 'No eligible clip recommendation is available for preview.',
        title: 'Bad Request',
      });
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
      throw new BadRequestException({
        code: 'public_youtube_clip_no_recommendation',
        detail: 'No eligible clip recommendation is available for preview.',
        title: 'Bad Request',
      });
    }

    try {
      const response = await this.fileQueueService.processVideo({
        id: jobId,
        ingredientId: jobId,
        organizationId: PUBLIC_FILE_ORGANIZATION_ID,
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
        userId: PUBLIC_FILE_USER_ID,
      });
      const resolvedJobId = response.jobId || jobId;
      const updated = await this.store.patchByToken(previewToken, {
        preview: {
          jobId: resolvedJobId,
          recommendationId,
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
        preview: { recommendationId, status: 'failed' },
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

  private normalizeYoutubeUrl(input: string): string {
    let url: URL;
    try {
      url = new URL(input.trim());
    } catch {
      throw this.invalidUrl();
    }
    const hostname = url.hostname.toLowerCase();
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !YOUTUBE_HOSTS.has(hostname)
    ) {
      throw this.invalidUrl();
    }

    let videoId: string | null = null;
    if (hostname === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else {
      const [kind, candidate] = url.pathname.split('/').filter(Boolean);
      if (['embed', 'live', 'shorts'].includes(kind ?? '')) {
        videoId = candidate ?? null;
      }
    }

    if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
      throw this.invalidUrl();
    }
    return `https://www.youtube.com/watch?v=${videoId}`;
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

  private async assertVideoIsPublic(url: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.get('https://www.youtube.com/oembed', {
          params: { format: 'json', url },
          timeout: 5_000,
        }),
      );
    } catch {
      throw new BadRequestException({
        code: 'public_youtube_clip_unavailable_source',
        detail: 'The YouTube video is unavailable, private, or unsupported.',
        title: 'Bad Request',
      });
    }
  }

  private invalidUrl(): BadRequestException {
    return new BadRequestException({
      code: 'public_youtube_clip_url_invalid',
      detail: 'Provide a supported public YouTube video URL.',
      title: 'Bad Request',
    });
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
