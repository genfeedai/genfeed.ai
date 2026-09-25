import type { TwitterInboxTweet } from '@api/services/integrations/twitter/services/twitter-inbox.service';
import {
  CronXReplyWatchService,
  matchRepliesToPosts,
} from '@workers/crons/x-replies/cron.x-reply-watch.service';
import {
  X_REPLY_WATCH_LOCK_KEY,
  X_REPLY_WATCH_MAX_PAGES,
  X_REPLY_WATCH_WINDOW_MS,
  xReplyWatchBackoffKey,
  xReplyWatchCursorKey,
} from '@workers/crons/x-replies/x-reply-watch.constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-09-25T12:00:00.000Z');

function credential(id: string, organizationId = `org-${id}`) {
  return {
    brandId: `brand-${id}`,
    externalHandle: `handle_${id}`,
    id,
    organizationId,
    userId: `user-${id}`,
    username: null,
  };
}

function post(
  id: string,
  credentialId: string,
  externalId: string,
  organizationId = `org-${credentialId}`,
) {
  return {
    brandId: `brand-${credentialId}`,
    credentialId,
    description: `post ${id}`,
    externalId,
    id,
    label: null,
    organizationId,
    url: null,
  };
}

function tweet(
  tweetId: string,
  overrides: Partial<TwitterInboxTweet> = {},
): TwitterInboxTweet {
  return {
    authorId: `author-${tweetId}`,
    authorUsername: `fan_${tweetId}`,
    conversationId: tweetId,
    createdAt: NOW,
    inReplyToId: null,
    text: `tweet ${tweetId}`,
    tweetId,
    ...overrides,
  };
}

function setup() {
  const cache = new Map<string, unknown>();
  const cacheService = {
    acquireLock: vi.fn().mockResolvedValue(true),
    get: vi.fn(async (key: string) => cache.get(key) ?? null),
    releaseLock: vi.fn().mockResolvedValue(true),
    set: vi.fn(async (key: string, value: unknown) => {
      cache.set(key, value);
      return true;
    }),
  };
  const prisma = {
    credential: { findMany: vi.fn().mockResolvedValue([]) },
    post: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const twitterService = {
    handleAuthorizationError: vi.fn().mockResolvedValue(false),
    listMentionsPage: vi.fn().mockResolvedValue({ tweets: [] }),
  };
  const socialInboxService = {
    ingestXPostReplies: vi.fn().mockResolvedValue({
      conversationsCreated: 0,
      createdMessageIds: [],
      messagesCreated: 0,
    }),
  };
  const notifications = {
    recordNewReplies: vi.fn().mockResolvedValue('delivery-1'),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const service = new CronXReplyWatchService(
    prisma as never,
    cacheService as never,
    twitterService as never,
    socialInboxService as never,
    notifications as never,
    logger as never,
  );
  return {
    cache,
    cacheService,
    logger,
    notifications,
    prisma,
    service,
    socialInboxService,
    twitterService,
  };
}

describe('CronXReplyWatchService', () => {
  let context: ReturnType<typeof setup>;

  beforeEach(() => {
    context = setup();
  });

  it('reads only posts published inside the window for connected X accounts', async () => {
    context.prisma.credential.findMany.mockResolvedValue([credential('a')]);

    await context.service.watchRecentPostReplies(NOW);

    expect(context.prisma.credential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isConnected: true,
          isDeleted: false,
          platform: 'TWITTER',
        }),
      }),
    );
    expect(context.prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          credentialId: { in: ['a'] },
          isDeleted: false,
          organizationId: { in: ['org-a'] },
          publishedAt: {
            gte: new Date(NOW.getTime() - X_REPLY_WATCH_WINDOW_MS),
            lte: NOW,
          },
          status: 'public',
        }),
      }),
    );
  });

  it('makes no X call for accounts without a post in the last 24 hours', async () => {
    context.prisma.credential.findMany.mockResolvedValue([
      credential('a'),
      credential('b'),
    ]);
    context.prisma.post.findMany.mockResolvedValue([]);

    const totals = await context.service.watchRecentPostReplies(NOW);

    expect(context.twitterService.listMentionsPage).not.toHaveBeenCalled();
    expect(totals.credentials).toBe(0);
  });

  it('skips the post query entirely when no X account is connected', async () => {
    await context.service.watchRecentPostReplies(NOW);

    expect(context.prisma.post.findMany).not.toHaveBeenCalled();
    expect(context.twitterService.listMentionsPage).not.toHaveBeenCalled();
  });

  it('makes exactly one mentions call per account with recent posts', async () => {
    context.prisma.credential.findMany.mockResolvedValue([
      credential('a'),
      credential('b'),
      credential('c'),
    ]);
    context.prisma.post.findMany.mockResolvedValue([
      post('p1', 'a', '1800000000000000100'),
      post('p2', 'a', '1800000000000000050'),
      post('p3', 'b', '1800000000000000200'),
    ]);
    context.cache.set(xReplyWatchCursorKey('b'), '1800000000000000300');

    await context.service.watchRecentPostReplies(NOW);

    expect(context.twitterService.listMentionsPage).toHaveBeenCalledTimes(2);
    // Floor is the oldest in-window post: a reply is always newer than it.
    expect(context.twitterService.listMentionsPage).toHaveBeenCalledWith(
      'org-a',
      'brand-a',
      { limit: 100, sinceId: '1800000000000000050' },
      'a',
    );
    // A stored cursor newer than the floor wins.
    expect(context.twitterService.listMentionsPage).toHaveBeenCalledWith(
      'org-b',
      'brand-b',
      { limit: 100, sinceId: '1800000000000000300' },
      'b',
    );
  });

  it('ignores posts that belong to another organization than the account', async () => {
    context.prisma.credential.findMany.mockResolvedValue([credential('a')]);
    context.prisma.post.findMany.mockResolvedValue([
      post('p1', 'a', '1800000000000000100', 'org-intruder'),
    ]);

    await context.service.watchRecentPostReplies(NOW);

    expect(context.twitterService.listMentionsPage).not.toHaveBeenCalled();
  });

  it('ingests only replies on recent posts, notifies once, and advances the cursor', async () => {
    context.prisma.credential.findMany.mockResolvedValue([credential('a')]);
    context.prisma.post.findMany.mockResolvedValue([
      post('p1', 'a', '1800000000000000100'),
      post('p2', 'a', '1800000000000000110'),
    ]);
    const direct = tweet('1800000000000000120', {
      conversationId: '1800000000000000100',
      inReplyToId: '1800000000000000100',
    });
    const inThread = tweet('1800000000000000130', {
      conversationId: '1800000000000000110',
      inReplyToId: '1800000000000000125',
    });
    const plainMention = tweet('1800000000000000140');
    const elsewhere = tweet('1800000000000000150', {
      conversationId: '1700000000000000000',
      inReplyToId: '1700000000000000000',
    });
    context.twitterService.listMentionsPage.mockResolvedValue({
      tweets: [elsewhere, plainMention, inThread, direct],
    });
    context.socialInboxService.ingestXPostReplies.mockResolvedValue({
      conversationsCreated: 2,
      createdMessageIds: [direct.tweetId, inThread.tweetId],
      messagesCreated: 2,
    });

    const totals = await context.service.watchRecentPostReplies(NOW);

    expect(context.socialInboxService.ingestXPostReplies).toHaveBeenCalledWith(
      { brandId: 'brand-a', organizationId: 'org-a', userId: 'user-a' },
      {
        credentialId: 'a',
        replies: [
          { post: expect.objectContaining({ id: 'p2' }), reply: inThread },
          { post: expect.objectContaining({ id: 'p1' }), reply: direct },
        ],
      },
    );
    expect(context.notifications.recordNewReplies).toHaveBeenCalledOnce();
    expect(context.notifications.recordNewReplies).toHaveBeenCalledWith({
      accountHandle: 'handle_a',
      brandId: 'brand-a',
      credentialId: 'a',
      newReplyExternalIds: [direct.tweetId, inThread.tweetId],
      organizationId: 'org-a',
      platform: 'twitter',
    });
    // Filtered mentions were still paid for: the cursor moves past them.
    expect(context.cache.get(xReplyWatchCursorKey('a'))).toBe(
      elsewhere.tweetId,
    );
    expect(totals).toEqual(
      expect.objectContaining({
        credentials: 1,
        mentionsRead: 4,
        notified: 1,
        repliesCreated: 2,
        repliesMatched: 2,
      }),
    );
  });

  it('follows mention pages before advancing the cursor', async () => {
    context.prisma.credential.findMany.mockResolvedValue([credential('a')]);
    context.prisma.post.findMany.mockResolvedValue([
      post('p1', 'a', '1800000000000000100'),
    ]);
    const newest = tweet('1800000000000000300', {
      conversationId: '1800000000000000100',
      inReplyToId: '1800000000000000100',
    });
    const older = tweet('1800000000000000200', {
      conversationId: '1800000000000000100',
      inReplyToId: '1800000000000000100',
    });
    context.twitterService.listMentionsPage
      .mockResolvedValueOnce({ nextToken: 'page-2', tweets: [newest] })
      .mockResolvedValueOnce({ tweets: [older] });

    const totals = await context.service.watchRecentPostReplies(NOW);

    expect(context.twitterService.listMentionsPage).toHaveBeenCalledTimes(2);
    expect(context.twitterService.listMentionsPage).toHaveBeenLastCalledWith(
      'org-a',
      'brand-a',
      {
        limit: 100,
        paginationToken: 'page-2',
        sinceId: '1800000000000000100',
      },
      'a',
    );
    expect(totals.mentionsRead).toBe(2);
    expect(context.cache.get(xReplyWatchCursorKey('a'))).toBe(newest.tweetId);
  });

  it('keeps the cursor when the page cap leaves older mentions unread', async () => {
    context.prisma.credential.findMany.mockResolvedValue([credential('a')]);
    context.prisma.post.findMany.mockResolvedValue([
      post('p1', 'a', '1800000000000000100'),
    ]);
    context.cache.set(xReplyWatchCursorKey('a'), '1800000000000000150');
    context.twitterService.listMentionsPage.mockResolvedValue({
      nextToken: 'more',
      tweets: [tweet('1800000000000000900')],
    });

    await context.service.watchRecentPostReplies(NOW);

    expect(context.twitterService.listMentionsPage).toHaveBeenCalledTimes(
      X_REPLY_WATCH_MAX_PAGES,
    );
    expect(context.cache.get(xReplyWatchCursorKey('a'))).toBe(
      '1800000000000000150',
    );
    expect(context.logger.warn).toHaveBeenCalledOnce();
  });

  it('does not notify when every matched reply was already stored', async () => {
    context.prisma.credential.findMany.mockResolvedValue([credential('a')]);
    context.prisma.post.findMany.mockResolvedValue([
      post('p1', 'a', '1800000000000000100'),
    ]);
    context.twitterService.listMentionsPage.mockResolvedValue({
      tweets: [
        tweet('1800000000000000120', {
          conversationId: '1800000000000000100',
          inReplyToId: '1800000000000000100',
        }),
      ],
    });

    await context.service.watchRecentPostReplies(NOW);

    expect(
      context.socialInboxService.ingestXPostReplies,
    ).toHaveBeenCalledOnce();
    expect(context.notifications.recordNewReplies).not.toHaveBeenCalled();
  });

  it('backs off a rate-limited account and makes no call while backing off', async () => {
    context.prisma.credential.findMany.mockResolvedValue([credential('a')]);
    context.prisma.post.findMany.mockResolvedValue([
      post('p1', 'a', '1800000000000000100'),
    ]);
    context.twitterService.listMentionsPage.mockRejectedValue(
      Object.assign(new Error('Too Many Requests'), { code: 429 }),
    );

    const first = await context.service.watchRecentPostReplies(NOW);
    const second = await context.service.watchRecentPostReplies(NOW);

    expect(first.failed).toBe(1);
    expect(second.skipped).toBe(1);
    expect(context.twitterService.listMentionsPage).toHaveBeenCalledOnce();
    expect(context.cache.has(xReplyWatchBackoffKey('a'))).toBe(true);
    expect(context.cache.has(xReplyWatchCursorKey('a'))).toBe(false);
    expect(
      context.twitterService.handleAuthorizationError,
    ).not.toHaveBeenCalled();
  });

  it('backs off a tier or scope refusal for the whole window', async () => {
    context.prisma.credential.findMany.mockResolvedValue([credential('a')]);
    context.prisma.post.findMany.mockResolvedValue([
      post('p1', 'a', '1800000000000000100'),
    ]);
    context.twitterService.listMentionsPage.mockRejectedValue(
      Object.assign(new Error('client-not-enrolled'), { code: 403 }),
    );

    await context.service.watchRecentPostReplies(NOW);

    expect(context.cacheService.set).toHaveBeenCalledWith(
      xReplyWatchBackoffKey('a'),
      expect.any(Object),
      { ttl: X_REPLY_WATCH_WINDOW_MS / 1000 },
    );
  });

  it('hands authorization failures to the credential lifecycle', async () => {
    context.prisma.credential.findMany.mockResolvedValue([credential('a')]);
    context.prisma.post.findMany.mockResolvedValue([
      post('p1', 'a', '1800000000000000100'),
    ]);
    const error = Object.assign(new Error('Unauthorized'), { code: 401 });
    context.twitterService.listMentionsPage.mockRejectedValue(error);

    await context.service.watchRecentPostReplies(NOW);

    expect(
      context.twitterService.handleAuthorizationError,
    ).toHaveBeenCalledWith('a', error, 'CronXReplyWatchService');
    expect(context.cache.has(xReplyWatchBackoffKey('a'))).toBe(false);
  });

  it('does nothing while another sweep holds the lock', async () => {
    context.cacheService.acquireLock.mockResolvedValue(false);

    await context.service.watchRecentPostReplies(NOW);

    expect(context.cacheService.acquireLock).toHaveBeenCalledWith(
      X_REPLY_WATCH_LOCK_KEY,
      expect.any(Number),
    );
    expect(context.prisma.credential.findMany).not.toHaveBeenCalled();
    expect(context.cacheService.releaseLock).not.toHaveBeenCalled();
  });
});

describe('matchRepliesToPosts', () => {
  it('drops non-replies and replies to unrelated tweets', () => {
    const posts = [
      {
        brandId: 'brand-a',
        description: 'post',
        externalId: '100',
        id: 'p1',
        label: null,
        url: null,
      },
    ];

    expect(
      matchRepliesToPosts(
        [
          tweet('101', { conversationId: '100', inReplyToId: '100' }),
          tweet('102'),
          tweet('103', { conversationId: '50', inReplyToId: '50' }),
        ],
        posts,
      ).map(({ reply }) => reply.tweetId),
    ).toEqual(['101']);
  });
});
