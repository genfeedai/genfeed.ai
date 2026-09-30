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

  it('reports a total failure when every enqueue rejects', async () => {
    const outcome = await settleMessagesSyncJobs([
      { platform: 'Instagram', run: () => Promise.reject(new Error('ig')) },
      { platform: 'X', run: () => Promise.reject(new Error('x')) },
    ]);

    expect(outcome).toEqual({
      failedPlatforms: ['Instagram', 'X'],
      hasSuccess: false,
    });
  });
});

describe('getMessagesSyncFeedback', () => {
  it('describes a unified inbox sync', () => {
    expect(
      getMessagesSyncFeedback({
        failedPlatforms: [],
        hasSuccess: true,
        scope: 'all',
      }),
    ).toEqual({
      error: null,
      notice:
        'Inbox sync started. New comments and direct messages will appear here once the background jobs finish.',
    });
  });

  it('keeps the success notice when every platform queued', () => {
    expect(
      getMessagesSyncFeedback({
        failedPlatforms: [],
        hasSuccess: true,
        scope: 'comments',
      }),
    ).toEqual({
      error: null,
      notice:
        'Comment sync started. New comments will appear here once the background jobs finish.',
    });
  });

  it('exposes a partial-failure notice that names the failed platforms', () => {
    expect(
      getMessagesSyncFeedback({
        failedPlatforms: ['X'],
        hasSuccess: true,
        scope: 'dms',
      }),
    ).toEqual({
      error: null,
      notice:
        'Direct message sync started. New threads will appear here once the background jobs finish. Partial failure: X failed to queue.',
    });
  });

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
