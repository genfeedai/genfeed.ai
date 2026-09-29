import { describe, expect, it, vi } from 'vitest';
import {
  getMessagesSyncFeedback,
  settleMessagesSyncJobs,
} from './messages-page.helpers';

describe('settleMessagesSyncJobs', () => {
  it('attempts every platform when one enqueue rejects', async () => {
    const youtube = vi.fn().mockResolvedValue(undefined);
    const instagram = vi.fn().mockRejectedValue(new Error('not connected'));
    const x = vi.fn().mockResolvedValue(undefined);
    const linkedIn = vi.fn().mockResolvedValue(undefined);

    const outcome = await settleMessagesSyncJobs([
      { platform: 'YouTube', run: youtube },
      { platform: 'Instagram', run: instagram },
      { platform: 'X', run: x },
      { platform: 'LinkedIn', run: linkedIn },
    ]);

    expect(youtube).toHaveBeenCalledTimes(1);
    expect(instagram).toHaveBeenCalledTimes(1);
    expect(x).toHaveBeenCalledTimes(1);
    expect(linkedIn).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({
      failedPlatforms: ['Instagram'],
      hasSuccess: true,
    });
  });
});

describe('getMessagesSyncFeedback', () => {
  it('surfaces a total enqueue failure as an error', () => {
    expect(
      getMessagesSyncFeedback({
        failedPlatforms: ['Instagram', 'X', 'LinkedIn'],
        hasSuccess: false,
        scope: 'dms',
      }),
    ).toEqual({
      error: 'Sync failed to queue for Instagram, X, LinkedIn.',
      notice: null,
    });
  });
});
