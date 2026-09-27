import { StreaksActivityListener } from '@api/collections/streaks/listeners/streaks-activity.listener';
import { ActivityKey } from '@genfeedai/contracts';

describe('StreaksActivityListener', () => {
  function setup() {
    const streaksService = {
      checkAndUpdate: vi.fn(),
      isQualifyingActivityKey: vi.fn(
        (key: string | null) => key === ActivityKey.IMAGE_GENERATED,
      ),
    };
    const logger = { warn: vi.fn() };
    const listener = new StreaksActivityListener(
      streaksService as never,
      logger as never,
    );
    return { listener, logger, streaksService };
  }
  const createdAt = new Date('2026-09-27T10:00:00.000Z');

  it('advances each author once per organization for qualifying keys', async () => {
    const { listener, streaksService } = setup();

    await listener.handleActivityRecorded({
      activities: [
        {
          createdAt,
          id: 'a',
          key: ActivityKey.IMAGE_GENERATED,
          organizationId: 'org-1',
          userId: 'user-1',
        },
        {
          createdAt,
          id: 'b',
          key: ActivityKey.IMAGE_GENERATED,
          organizationId: 'org-1',
          userId: 'user-1',
        },
        {
          createdAt,
          id: 'c',
          key: ActivityKey.IMAGE_FAILED,
          organizationId: 'org-1',
          userId: 'user-2',
        },
        {
          createdAt,
          id: 'd',
          key: ActivityKey.IMAGE_GENERATED,
          organizationId: null,
          userId: 'user-3',
        },
      ],
    });

    expect(streaksService.checkAndUpdate).toHaveBeenCalledTimes(1);
    expect(streaksService.checkAndUpdate).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      createdAt,
    );
  });

  it('logs a streak failure without throwing', async () => {
    const { listener, logger, streaksService } = setup();
    streaksService.checkAndUpdate.mockRejectedValue(new Error('db down'));

    await expect(
      listener.handleActivityRecorded({
        activities: [
          {
            createdAt,
            id: 'a',
            key: ActivityKey.IMAGE_GENERATED,
            organizationId: 'org-1',
            userId: 'user-1',
          },
        ],
      }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
