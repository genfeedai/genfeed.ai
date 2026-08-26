import { randomBytes, randomUUID } from 'node:crypto';
import { hashToken, toBase64Url } from '@api/auth/shared/pkce.util';
import type {
  ClipSourceArtifact,
  IPublicYoutubeClipPreview,
  IPublicYoutubeTranscriptSegment,
  PublicYoutubeClipToolStatus,
} from '@genfeedai/interfaces';
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
      const parsed = JSON.parse(serialized) as StoredPublicYoutubeClipSession;
      if (!parsed?.id || !parsed.sourceVideoUrl || !parsed.expiresAt) {
        throw new Error('Invalid public clip session');
      }
      return parsed;
    } catch {
      throw this.expired();
    }
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
