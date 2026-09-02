import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';

describe('TikTok status error messages', () => {
  it('does not treat a thrown string as a moderation failure', async () => {
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    const postsService = { patch: vi.fn() };
    const tiktokService = {
      refreshToken: vi
        .fn()
        .mockRejectedValue('TikTok publish failed: string rejection'),
    };
    const schedulerPublishStateService = { transitionPost: vi.fn() };
    const service = new CronTiktokStatusService(
      logger as never,
      postsService as never,
      tiktokService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      schedulerPublishStateService as never,
      {} as never,
    );
    const checkPostStatus = (
      service as unknown as {
        checkPostStatus: (
          post: unknown,
          now: Date,
          maxAge: Date,
          provenance: unknown,
        ) => Promise<void>;
      }
    ).checkPostStatus.bind(service);
    const now = new Date('2026-08-30T10:00:00.000Z');

    await checkPostStatus(
      {
        brandId: 'brand-1',
        credential: {
          accessToken: 'encrypted-token',
          id: 'credential-1',
          isConnected: true,
        },
        externalId: 'publish-1',
        id: 'post-1',
        organizationId: 'org-1',
        updatedAt: now,
      },
      now,
      new Date('2026-08-29T10:00:00.000Z'),
      {},
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed for post post-1'),
      { error: undefined, publishId: 'publish-1' },
    );
    expect(postsService.patch).not.toHaveBeenCalled();
    expect(schedulerPublishStateService.transitionPost).not.toHaveBeenCalled();
  });
});
