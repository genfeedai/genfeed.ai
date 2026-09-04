import { hashToken } from '@api/auth/shared/pkce.util';
import { PublicClipToolStoreService } from '@api/services/public-clip-tool/public-clip-tool-store.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { GoneException } from '@nestjs/common';

const storedHighlightWithoutTags = {
  clip_type: 'educational',
  end_time: 40,
  id: 'moment-1',
  start_time: 10,
  summary: 'Useful moment',
  title: 'Useful moment',
  virality_score: 80,
};

const storedHighlight = {
  ...storedHighlightWithoutTags,
  tags: ['educational'],
};

const storedTranscriptSegment = {
  end: 40,
  start: 0,
  text: 'Transcript',
};

function storedSession(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    createdAt: '2026-08-26T10:00:00.000Z',
    expiresAt: '2026-08-26T12:00:00.000Z',
    highlights: [],
    id: 'session-1',
    language: 'en',
    preview: { status: 'available' },
    progress: 0,
    sourceFingerprint: 'fingerprint',
    sourceVideoUrl: 'https://www.youtube.com/watch?v=abc12345',
    status: 'queued',
    transcriptSegments: [],
    ...overrides,
  };
}

describe('PublicClipToolStoreService', () => {
  const redis = { eval: vi.fn(), get: vi.fn() };
  const redisService = { getPublisher: vi.fn(() => redis) };
  const logger = { warn: vi.fn() };
  const previewToken = 'a'.repeat(43);
  let service: PublicClipToolStoreService;

  beforeEach(() => {
    vi.clearAllMocks();
    redis.eval.mockResolvedValue(1);
    redis.get.mockResolvedValue(null);
    service = new PublicClipToolStoreService(
      redisService as unknown as RedisService,
      logger as unknown as LoggerService,
    );
  });

  it('atomically releases the failed session and only its matching locks', async () => {
    await service.releaseFailedSession(
      previewToken,
      'source-fingerprint',
      'request-key-1',
    );

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      3,
      `public-youtube-clip:session:${hashToken(previewToken)}`,
      'public-youtube-clip:duplicate:source-fingerprint',
      `public-youtube-clip:idempotency:${hashToken(
        'source-fingerprint:request-key-1',
      )}`,
      previewToken,
    );
  });

  it('keeps the original queue failure authoritative if cleanup is unavailable', async () => {
    redis.eval.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(
      service.releaseFailedSession(previewToken, 'source-fingerprint'),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      'Failed public YouTube clip reservation cleanup failed',
      expect.objectContaining({
        code: 'public_youtube_clip_failed_reservation_cleanup_failed',
      }),
    );
  });

  it('preserves valid stored highlight and transcript arrays', async () => {
    redis.get.mockResolvedValue(
      JSON.stringify(
        storedSession({
          highlights: [storedHighlight],
          transcriptSegments: [storedTranscriptSegment],
        }),
      ),
    );

    await expect(service.getSession(previewToken)).resolves.toMatchObject({
      highlights: [storedHighlight],
      transcriptSegments: [storedTranscriptSegment],
    });
  });

  it.each([
    [
      'missing arrays',
      { highlights: undefined, transcriptSegments: undefined },
    ],
    ['Lua cjson empty objects', { highlights: {}, transcriptSegments: {} }],
  ])('normalizes %s to empty stored arrays', async (_label, overrides) => {
    redis.get.mockResolvedValue(JSON.stringify(storedSession(overrides)));

    await expect(service.getSession(previewToken)).resolves.toMatchObject({
      highlights: [],
      transcriptSegments: [],
    });
  });

  it.each([
    ['missing tags', undefined],
    ['Lua cjson empty-object tags', {}],
  ])('normalizes %s on a valid stored highlight', async (_label, tags) => {
    const highlight = {
      ...storedHighlightWithoutTags,
      ...(tags === undefined ? {} : { tags }),
    };
    redis.get.mockResolvedValue(
      JSON.stringify(storedSession({ highlights: [highlight] })),
    );

    await expect(service.getSession(previewToken)).resolves.toMatchObject({
      highlights: [{ ...storedHighlightWithoutTags, tags: [] }],
    });
  });

  it.each([
    ['a nonempty highlights object', { highlights: { bad: true } }],
    ['a scalar highlights value', { highlights: 'bad' }],
    [
      'a nonempty transcript array object',
      { transcriptSegments: { bad: true } },
    ],
    ['a scalar transcript value', { transcriptSegments: 1 }],
    [
      'a malformed highlight member',
      { highlights: [{ ...storedHighlight, end_time: '40' }] },
    ],
    [
      'nonempty highlight tags object',
      { highlights: [{ ...storedHighlightWithoutTags, tags: { bad: true } }] },
    ],
    [
      'scalar highlight tags',
      { highlights: [{ ...storedHighlightWithoutTags, tags: 'bad' }] },
    ],
    [
      'a malformed highlight tag member',
      { highlights: [{ ...storedHighlightWithoutTags, tags: [1] }] },
    ],
    [
      'a malformed transcript member',
      { transcriptSegments: [{ end: 40, start: 0 }] },
    ],
  ])('rejects %s with the bounded expired response', async (_label, patch) => {
    redis.get.mockResolvedValue(JSON.stringify(storedSession(patch)));

    try {
      await service.getSession(previewToken);
      expect.unreachable('Expected malformed stored session to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(GoneException);
      expect((error as GoneException).getResponse()).toEqual({
        code: 'public_youtube_clip_expired_or_claimed',
        detail: 'This free-tool session has expired or was already claimed.',
        title: 'Gone',
      });
    }
  });
});
