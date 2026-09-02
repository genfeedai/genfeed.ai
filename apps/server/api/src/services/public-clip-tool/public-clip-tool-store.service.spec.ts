import { hashToken } from '@api/auth/shared/pkce.util';
import { PublicClipToolStoreService } from '@api/services/public-clip-tool/public-clip-tool-store.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';

describe('PublicClipToolStoreService', () => {
  const redis = { eval: vi.fn() };
  const redisService = { getPublisher: vi.fn(() => redis) };
  const logger = { warn: vi.fn() };
  const previewToken = 'a'.repeat(43);
  let service: PublicClipToolStoreService;

  beforeEach(() => {
    vi.clearAllMocks();
    redis.eval.mockResolvedValue(1);
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
});
