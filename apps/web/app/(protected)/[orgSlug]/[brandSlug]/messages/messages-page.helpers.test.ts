import { SocialConversationType } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  getDirectMessageReconnectAccounts,
  getMessagesSyncFeedback,
  getMessagesSyncResultFeedback,
  parseMessagesInboxView,
  parseMessagesSurface,
  settleMessagesSyncJobs,
} from './messages-page.helpers';

describe('parseMessagesInboxView', () => {
  it('accepts every status view and falls back to Inbox', () => {
    for (const view of [
      'inbox',
      'unread',
      'review',
      'resolved',
      'archived',
      'all',
    ] as const) {
      expect(parseMessagesInboxView(view)).toBe(view);
    }
    expect(parseMessagesInboxView('nonsense')).toBe('inbox');
    expect(parseMessagesInboxView(null)).toBe('inbox');
    expect(parseMessagesInboxView(undefined)).toBe('inbox');
  });
});

describe('parseMessagesSurface (#5502)', () => {
  it('accepts the Inbox type filters and falls back to All', () => {
    expect(parseMessagesSurface('dm')).toBe(SocialConversationType.DM);
    expect(parseMessagesSurface('reply')).toBe(SocialConversationType.REPLY);
    expect(parseMessagesSurface('comment')).toBe(
      SocialConversationType.COMMENT,
    );
    expect(parseMessagesSurface('mention')).toBe('all');
    expect(parseMessagesSurface('nonsense')).toBe('all');
    expect(parseMessagesSurface(null)).toBe('all');
  });
});

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

describe('getMessagesSyncResultFeedback', () => {
  it('reports what a YouTube comment sync scanned and imported', () => {
    expect(
      getMessagesSyncResultFeedback([
        {
          commentsSeen: 3,
          conversationType: 'comment',
          conversationsCreated: 2,
          kind: 'sync-completed',
          messagesCreated: 3,
          platform: 'youtube',
          postFailureCount: 1,
          postsScanned: 4,
        },
      ]),
    ).toEqual({
      error: null,
      notice:
        'YouTube comments sync finished: scanned 4 videos, saw 3 comments, imported 3 new messages in 2 conversations. 1 video could not be read.',
    });
  });

  it('says so when no published video is eligible instead of reporting a bare success', () => {
    expect(
      getMessagesSyncResultFeedback([
        {
          commentsSeen: 0,
          conversationType: 'comment',
          conversationsCreated: 0,
          kind: 'sync-completed',
          messagesCreated: 0,
          platform: 'youtube',
          postFailureCount: 0,
          postsScanned: 0,
        },
      ]).notice,
    ).toContain('no published video is eligible');
  });

  it('shows a failed job as an error, never as a finished sync', () => {
    expect(
      getMessagesSyncResultFeedback([
        {
          conversationType: 'comment',
          kind: 'sync-failed',
          message: 'Inbox sync found no connected account.',
          platform: 'youtube',
        },
      ]),
    ).toEqual({
      error:
        'YouTube comments sync failed: Inbox sync found no connected account.',
      notice: null,
    });
  });

  it('summarises non-YouTube syncs by their imported counts', () => {
    expect(
      getMessagesSyncResultFeedback([
        {
          conversationType: 'dm',
          conversationsCreated: 1,
          kind: 'sync-completed',
          messagesCreated: 1,
          platform: 'twitter',
        },
      ]).notice,
    ).toBe('X direct messages sync finished: 1 new message in 1 conversation.');
  });
});

describe('getDirectMessageReconnectAccounts', () => {
  const credentials = [
    {
      brandId: 'brand-1',
      directMessageCapability: 'reconnect' as const,
      externalHandle: 'genfeedai',
      externalName: 'Genfeed',
      id: 'credential-x-old',
      label: 'X',
      platform: 'twitter',
    },
    {
      brandId: 'brand-1',
      directMessageCapability: 'ok' as const,
      externalHandle: 'shipshitdev',
      externalName: 'Ship',
      id: 'credential-x-new',
      label: 'X',
      platform: 'twitter',
    },
    {
      brandId: 'brand-1',
      directMessageCapability: 'unknown' as const,
      externalHandle: 'legacy',
      externalName: 'Legacy',
      id: 'credential-x-uncaptured',
      label: 'X',
      platform: 'twitter',
    },
  ] as Parameters<typeof getDirectMessageReconnectAccounts>[0];

  it.each(['all', SocialConversationType.DM] as const)(
    'lists only X accounts known to lack dm.read on the %s surface',
    (surface) => {
      expect(getDirectMessageReconnectAccounts(credentials, surface)).toEqual([
        {
          brandId: 'brand-1',
          credentialId: 'credential-x-old',
          label: '@genfeedai',
        },
      ]);
    },
  );

  it('stays quiet on the Comments surface', () => {
    expect(
      getDirectMessageReconnectAccounts(
        credentials,
        SocialConversationType.COMMENT,
      ),
    ).toEqual([]);
  });
});
