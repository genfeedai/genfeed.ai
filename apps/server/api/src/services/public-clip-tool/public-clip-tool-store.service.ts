import { randomBytes, randomUUID } from 'node:crypto';
import { hashToken, toBase64Url } from '@api/auth/shared/pkce.util';
import {
  type ClipSourceArtifact,
  type IPublicYoutubeClipPreview,
  type IPublicYoutubeTranscriptSegment,
  PUBLIC_YOUTUBE_CLIP_PREVIEW_STATUSES,
  PUBLIC_YOUTUBE_CLIP_TOOL_STATUSES,
  type PublicYoutubeClipPreviewStatus,
  type PublicYoutubeClipToolStatus,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import {
  ConflictException,
  GoneException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type Redis from 'ioredis';

const SESSION_TTL_SECONDS = 2 * 60 * 60;
const DUPLICATE_TTL_SECONDS = 30 * 60;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const WORKER_PROJECT_PATTERN = /^public-youtube-clip-session-([a-f0-9]{64})$/;
const SESSION_PREFIX = 'public-youtube-clip:session:';
const DUPLICATE_PREFIX = 'public-youtube-clip:duplicate:';
const IDEMPOTENCY_PREFIX = 'public-youtube-clip:idempotency:';
const MAX_TOKEN_GENERATION_ATTEMPTS = 3;
const SESSION_DECODE_REASONS = new Set([
  'Invalid public clip session array',
  'Invalid public clip session number',
  'Invalid public clip session object',
  'Invalid public clip session status',
  'Invalid public clip session string',
  'Invalid public clip preview status',
]);

const CREATE_SESSION_SCRIPT = `
local existingToken = redis.call('GET', KEYS[3])
if existingToken then
  return {'existing', existingToken}
end
if redis.call('EXISTS', KEYS[2]) == 1 then
  return {'duplicate'}
end
local stored = redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2], 'NX')
if not stored then
  return {'retry'}
end
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
redis.call('SET', KEYS[3], ARGV[3], 'EX', ARGV[2])
return {'created', ARGV[3]}
`;

const PATCH_SESSION_SCRIPT = `
local serialized = redis.call('GET', KEYS[1])
if not serialized then
  return nil
end
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then
  return nil
end
local value = cjson.decode(serialized)
local patch = cjson.decode(ARGV[1])
for key, item in pairs(patch) do
  value[key] = item
end
local updated = cjson.encode(value)
redis.call('SET', KEYS[1], updated, 'EX', ttl)
return updated
`;

const RESERVE_PREVIEW_SCRIPT = `
local serialized = redis.call('GET', KEYS[1])
if not serialized then
  return {'missing'}
end
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then
  return {'missing'}
end
local value = cjson.decode(serialized)
if value.status ~= 'ready' then
  return {'not-ready'}
end
if value.preview and value.preview.status ~= 'available' then
  return {'already-requested'}
end
local found = false
if value.highlights then
  for _, highlight in ipairs(value.highlights) do
    if highlight.id == ARGV[1] then
      found = true
      break
    end
  end
end
if not found then
  return {'unknown-recommendation'}
end
value.preview = {
  status = 'queued',
  recommendationId = ARGV[1],
  jobId = ARGV[2]
}
local updated = cjson.encode(value)
redis.call('SET', KEYS[1], updated, 'EX', ttl)
return {'reserved', updated}
`;

const RELEASE_FAILED_SESSION_SCRIPT = `
redis.call('DEL', KEYS[1])
if redis.call('GET', KEYS[2]) == ARGV[1] then
  redis.call('DEL', KEYS[2])
end
if redis.call('GET', KEYS[3]) == ARGV[1] then
  redis.call('DEL', KEYS[3])
end
return 1
`;

export interface StoredPublicYoutubeHighlight {
  readonly clip_type: string;
  readonly end_time: number;
  readonly id: string;
  readonly start_time: number;
  readonly summary: string;
  readonly tags: string[];
  readonly title: string;
  readonly virality_score: number;
}

export interface StoredPublicYoutubePreview extends IPublicYoutubeClipPreview {
  readonly jobId?: string;
  readonly s3Key?: string;
}

export interface StoredPublicYoutubeClipSession {
  readonly createdAt: string;
  readonly error?: string;
  readonly expiresAt: string;
  readonly highlights: StoredPublicYoutubeHighlight[];
  readonly id: string;
  readonly language: string;
  readonly preview: StoredPublicYoutubePreview;
  readonly progress: number;
  readonly sourceArtifact?: ClipSourceArtifact;
  readonly sourceFingerprint: string;
  readonly sourceVideoS3Key?: string;
  readonly sourceVideoUrl: string;
  readonly status: PublicYoutubeClipToolStatus;
  readonly transcriptSegments: IPublicYoutubeTranscriptSegment[];
  readonly transcriptSrt?: string;
  readonly transcriptText?: string;
}

export interface CreatePublicYoutubeSessionInput {
  readonly idempotencyKey?: string;
  readonly language: string;
  readonly sourceFingerprint: string;
  readonly sourceVideoUrl: string;
}

export interface CreatedPublicYoutubeSession {
  readonly isNew: boolean;
  readonly previewToken: string;
  readonly session: StoredPublicYoutubeClipSession;
}

@Injectable()
export class PublicClipToolStoreService {
  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async createSession(
    input: CreatePublicYoutubeSessionInput,
  ): Promise<CreatedPublicYoutubeSession> {
    const client = this.requireRedis();

    for (
      let attempt = 0;
      attempt < MAX_TOKEN_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      const previewToken = toBase64Url(randomBytes(32));
      const now = new Date();
      const session: StoredPublicYoutubeClipSession = {
        createdAt: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + SESSION_TTL_SECONDS * 1000,
        ).toISOString(),
        highlights: [],
        id: randomUUID(),
        language: input.language,
        preview: { status: 'available' },
        progress: 0,
        sourceFingerprint: input.sourceFingerprint,
        sourceVideoUrl: input.sourceVideoUrl,
        status: 'queued',
        transcriptSegments: [],
      };
      const idempotencyHash = hashToken(
        `${input.sourceFingerprint}:${input.idempotencyKey ?? previewToken}`,
      );

      try {
        const result = await client.eval(
          CREATE_SESSION_SCRIPT,
          3,
          this.sessionKey(previewToken),
          `${DUPLICATE_PREFIX}${input.sourceFingerprint}`,
          `${IDEMPOTENCY_PREFIX}${idempotencyHash}`,
          JSON.stringify(session),
          String(SESSION_TTL_SECONDS),
          previewToken,
          String(DUPLICATE_TTL_SECONDS),
        );
        const values = Array.isArray(result) ? result : [];
        const outcome = values[0];

        if (outcome === 'created') {
          return { isNew: true, previewToken, session };
        }

        if (outcome === 'existing' && typeof values[1] === 'string') {
          const existing = await this.getSession(values[1]);
          return { isNew: false, previewToken: values[1], session: existing };
        }

        if (outcome === 'duplicate') {
          throw new ConflictException({
            code: 'public_youtube_clip_duplicate',
            detail:
              'This video is already being processed. Continue the existing session or retry later.',
            title: 'Conflict',
          });
        }
      } catch (error) {
        if (error instanceof ConflictException) {
          throw error;
        }
        this.logger.error('Public YouTube clip session storage unavailable', {
          code: 'public_youtube_clip_storage_unavailable',
          error,
        });
        throw this.unavailable();
      }
    }

    throw this.unavailable();
  }

  async getSession(
    previewToken: string,
  ): Promise<StoredPublicYoutubeClipSession> {
    this.assertToken(previewToken);
    const client = this.requireRedis();

    try {
      const serialized = await client.get(this.sessionKey(previewToken));
      if (!serialized) {
        throw this.expired();
      }
      return this.parseSession(serialized);
    } catch (error) {
      if (error instanceof GoneException) {
        throw error;
      }
      this.logger.error('Public YouTube clip session read unavailable', {
        code: 'public_youtube_clip_read_unavailable',
        error,
      });
      throw this.unavailable();
    }
  }

  async patchByWorkerProjectId(
    projectId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const match = WORKER_PROJECT_PATTERN.exec(projectId);
    if (!match) {
      throw new Error('Invalid public YouTube clip worker project id.');
    }
    await this.patchKey(`${SESSION_PREFIX}${match[1]}`, patch);
  }

  async patchByToken(
    previewToken: string,
    patch: Record<string, unknown>,
  ): Promise<StoredPublicYoutubeClipSession> {
    this.assertToken(previewToken);
    return this.patchKey(this.sessionKey(previewToken), patch);
  }

  async reservePreview(
    previewToken: string,
    recommendationId: string,
    jobId: string,
  ): Promise<StoredPublicYoutubeClipSession> {
    this.assertToken(previewToken);
    const client = this.requireRedis();
    const result = await client.eval(
      RESERVE_PREVIEW_SCRIPT,
      1,
      this.sessionKey(previewToken),
      recommendationId,
      jobId,
    );
    const values = Array.isArray(result) ? result : [];
    const outcome = values[0];

    if (outcome === 'reserved' && typeof values[1] === 'string') {
      return this.parseSession(values[1]);
    }
    if (outcome === 'missing') {
      throw this.expired();
    }
    if (outcome === 'not-ready') {
      throw new ConflictException({
        code: 'public_youtube_clip_not_ready',
        detail: 'Clip recommendations are not ready yet.',
        title: 'Conflict',
      });
    }
    if (outcome === 'already-requested') {
      throw new ConflictException({
        code: 'public_youtube_preview_already_requested',
        detail: 'This free session has already used its preview allowance.',
        title: 'Conflict',
      });
    }
    throw new ConflictException({
      code: 'public_youtube_clip_recommendation_unknown',
      detail: 'The selected clip recommendation is not available.',
      title: 'Conflict',
    });
  }

  async deleteSession(previewToken: string): Promise<void> {
    this.assertToken(previewToken);
    try {
      await this.requireRedis().del(this.sessionKey(previewToken));
    } catch (error) {
      this.logger.warn('Claimed public YouTube clip session cleanup failed', {
        code: 'public_youtube_clip_cleanup_failed',
        error,
      });
    }
  }

  async releaseFailedSession(
    previewToken: string,
    sourceFingerprint: string,
    idempotencyKey?: string,
  ): Promise<void> {
    this.assertToken(previewToken);
    const idempotencyHash = hashToken(
      `${sourceFingerprint}:${idempotencyKey ?? previewToken}`,
    );
    try {
      await this.requireRedis().eval(
        RELEASE_FAILED_SESSION_SCRIPT,
        3,
        this.sessionKey(previewToken),
        `${DUPLICATE_PREFIX}${sourceFingerprint}`,
        `${IDEMPOTENCY_PREFIX}${idempotencyHash}`,
        previewToken,
      );
    } catch (error) {
      this.logger.warn(
        'Failed public YouTube clip reservation cleanup failed',
        {
          code: 'public_youtube_clip_failed_reservation_cleanup_failed',
          error,
        },
      );
    }
  }

  toWorkerProjectId(previewToken: string): string {
    this.assertToken(previewToken);
    return `public-youtube-clip-session-${hashToken(previewToken)}`;
  }

  tokenHash(previewToken: string): string {
    this.assertToken(previewToken);
    return hashToken(previewToken);
  }

  private async patchKey(
    key: string,
    patch: Record<string, unknown>,
  ): Promise<StoredPublicYoutubeClipSession> {
    const client = this.requireRedis();
    try {
      const serialized = await client.eval(
        PATCH_SESSION_SCRIPT,
        1,
        key,
        JSON.stringify(patch),
      );
      if (typeof serialized !== 'string') {
        throw this.expired();
      }
      return this.parseSession(serialized);
    } catch (error) {
      if (error instanceof GoneException) {
        throw error;
      }
      this.logger.error('Public YouTube clip session update unavailable', {
        code: 'public_youtube_clip_update_unavailable',
        error,
      });
      throw this.unavailable();
    }
  }

  private parseSession(serialized: string): StoredPublicYoutubeClipSession {
    try {
      const parsed = this.readRecord(JSON.parse(serialized) as unknown);
      const sourceArtifact =
        parsed.sourceArtifact === undefined
          ? undefined
          : this.readSourceArtifact(parsed.sourceArtifact);
      return {
        createdAt: this.readNonEmptyString(parsed.createdAt),
        ...(parsed.error === undefined
          ? {}
          : { error: this.readString(parsed.error) }),
        expiresAt: this.readNonEmptyString(parsed.expiresAt),
        highlights: this.readStoredArray(parsed.highlights, (value) =>
          this.readHighlight(value),
        ),
        id: this.readNonEmptyString(parsed.id),
        language: this.readNonEmptyString(parsed.language),
        preview: this.readPreview(parsed.preview),
        progress: this.readFiniteNumber(parsed.progress),
        ...(sourceArtifact ? { sourceArtifact } : {}),
        sourceFingerprint: this.readNonEmptyString(parsed.sourceFingerprint),
        ...(parsed.sourceVideoS3Key === undefined
          ? {}
          : {
              sourceVideoS3Key: this.readNonEmptyString(
                parsed.sourceVideoS3Key,
              ),
            }),
        sourceVideoUrl: this.readNonEmptyString(parsed.sourceVideoUrl),
        status: this.readStatus(parsed.status),
        transcriptSegments: this.readStoredArray(
          parsed.transcriptSegments,
          (value) => this.readTranscriptSegment(value),
        ),
        ...(parsed.transcriptSrt === undefined
          ? {}
          : { transcriptSrt: this.readString(parsed.transcriptSrt) }),
        ...(parsed.transcriptText === undefined
          ? {}
          : { transcriptText: this.readString(parsed.transcriptText) }),
      };
    } catch (error) {
      this.logger.warn('Invalid public YouTube clip session', {
        code: 'public_youtube_clip_session_invalid',
        reason: this.sessionDecodeReason(error),
        reportToSentry: false,
      });
      throw this.expired();
    }
  }

  private readFiniteNumber(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('Invalid public clip session number');
    }
    return value;
  }

  private readHighlight(value: unknown): StoredPublicYoutubeHighlight {
    const highlight = this.readRecord(value);
    return {
      clip_type: this.readOptionalProse(highlight.clip_type),
      end_time: this.readFiniteNumber(highlight.end_time),
      id: this.readNonEmptyString(highlight.id),
      start_time: this.readFiniteNumber(highlight.start_time),
      summary: this.readOptionalProse(highlight.summary),
      tags: this.readStoredTags(highlight.tags),
      title: this.readOptionalProse(highlight.title),
      virality_score: this.readFiniteNumber(highlight.virality_score),
    };
  }

  private readNonEmptyString(value: unknown): string {
    const result = this.readString(value);
    if (result.trim().length === 0) {
      throw new Error('Invalid public clip session string');
    }
    return result;
  }

  private readOptionalProse(value: unknown): string {
    return value === undefined || value === null ? '' : this.readString(value);
  }

  private readPreview(value: unknown): StoredPublicYoutubePreview {
    const preview = this.readRecord(value);
    return {
      ...(preview.jobId === undefined
        ? {}
        : { jobId: this.readNonEmptyString(preview.jobId) }),
      ...(preview.recommendationId === undefined
        ? {}
        : {
            recommendationId: this.readNonEmptyString(preview.recommendationId),
          }),
      ...(preview.s3Key === undefined
        ? {}
        : { s3Key: this.readNonEmptyString(preview.s3Key) }),
      status: this.readPreviewStatus(preview.status),
      ...(preview.url === undefined
        ? {}
        : { url: this.readNonEmptyString(preview.url) }),
    };
  }

  private readPreviewStatus(value: unknown): PublicYoutubeClipPreviewStatus {
    if (typeof value !== 'string') {
      throw new Error('Invalid public clip preview status');
    }
    const status = PUBLIC_YOUTUBE_CLIP_PREVIEW_STATUSES.find(
      (candidate) => candidate === value,
    );
    if (!status) {
      throw new Error('Invalid public clip preview status');
    }
    return status;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid public clip session object');
    }
    return value as Record<string, unknown>;
  }

  private readSourceArtifact(value: unknown): ClipSourceArtifact {
    const artifact = this.readRecord(value);
    return {
      contentType: this.readNonEmptyString(artifact.contentType),
      ...(artifact.durationSeconds === undefined
        ? {}
        : {
            durationSeconds: this.readFiniteNumber(artifact.durationSeconds),
          }),
      mediaUrl: this.readNonEmptyString(artifact.mediaUrl),
      ...(artifact.storageKey === undefined
        ? {}
        : { storageKey: this.readNonEmptyString(artifact.storageKey) }),
    };
  }

  private readStatus(value: unknown): PublicYoutubeClipToolStatus {
    if (typeof value !== 'string') {
      throw new Error('Invalid public clip session status');
    }
    const status = PUBLIC_YOUTUBE_CLIP_TOOL_STATUSES.find(
      (candidate) => candidate === value,
    );
    if (!status) {
      throw new Error('Invalid public clip session status');
    }
    return status;
  }

  private readStoredArray<T>(
    value: unknown,
    readItem: (item: unknown) => T,
  ): T[] {
    if (value === undefined || this.isEmptyRecord(value)) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new Error('Invalid public clip session array');
    }
    return value.map((item) => readItem(item));
  }

  private readString(value: unknown): string {
    if (typeof value !== 'string') {
      throw new Error('Invalid public clip session string');
    }
    return value;
  }

  private readStoredTags(value: unknown): string[] {
    if (value === null) {
      return [];
    }
    return this.readStoredArray(value, (tag) => this.readString(tag));
  }

  private readTranscriptSegment(
    value: unknown,
  ): IPublicYoutubeTranscriptSegment {
    const segment = this.readRecord(value);
    return {
      end: this.readFiniteNumber(segment.end),
      start: this.readFiniteNumber(segment.start),
      text: this.readString(segment.text),
    };
  }

  private sessionDecodeReason(error: unknown): string {
    if (error instanceof Error && SESSION_DECODE_REASONS.has(error.message)) {
      return error.message;
    }
    return 'Invalid public clip session JSON';
  }

  private isEmptyRecord(value: unknown): boolean {
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    );
  }

  private assertToken(token: string): void {
    if (!TOKEN_PATTERN.test(token)) {
      throw this.expired();
    }
  }

  private sessionKey(token: string): string {
    return `${SESSION_PREFIX}${hashToken(token)}`;
  }

  private requireRedis(): Redis {
    const client = this.redisService.getPublisher();
    if (!client) {
      throw this.unavailable();
    }
    return client;
  }

  private expired(): GoneException {
    return new GoneException({
      code: 'public_youtube_clip_expired_or_claimed',
      detail: 'This free-tool session has expired or was already claimed.',
      title: 'Gone',
    });
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'public_youtube_clip_unavailable',
      detail: 'The free clip tool is temporarily unavailable. Retry safely.',
      title: 'Service Unavailable',
    });
  }
}
