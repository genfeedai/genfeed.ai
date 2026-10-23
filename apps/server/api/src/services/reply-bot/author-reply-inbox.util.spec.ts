import {
  type AuthorReplyInboxPorts,
  collectAuthorReplyInbox,
} from '@api/services/reply-bot/author-reply-inbox.util';
import type { SocialContentData } from '@api/services/reply-bot/social-monitor.service';
import { ReplyBotPlatform, SocialContentType } from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-10-23T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const scope = { brandId: 'brand-fixture', organizationId: 'org-fixture' };

function content(partial: Partial<SocialContentData> = {}): SocialContentData {
  return {
    authorId: 'reader-fixture',
    authorUsername: 'reader',
    contentType: SocialContentType.COMMENT,
    createdAt: NOW,
    id: 'comment-fixture',
    platform: ReplyBotPlatform.TWITTER,
    text: 'Great point',
    ...partial,
  };
}

function createPorts() {
  return {
    constructorName: 'AuthorReplyLoopService',
    loadCredential: vi
      .fn<AuthorReplyInboxPorts['loadCredential']>()
      .mockResolvedValue({ accessToken: '', username: '@Brand' }),
    loadProcessedCommentIds: vi
      .fn<AuthorReplyInboxPorts['loadProcessedCommentIds']>()
      .mockResolvedValue(new Set<string>()),
    logger: { warn: vi.fn<AuthorReplyInboxPorts['logger']['warn']>() },
    socialMonitorService: {
      getContentComments: vi
        .fn<
          AuthorReplyInboxPorts['socialMonitorService']['getContentComments']
        >()
        .mockResolvedValue([]),
      getUserTimeline: vi
        .fn<AuthorReplyInboxPorts['socialMonitorService']['getUserTimeline']>()
        .mockResolvedValue([]),
    },
  } satisfies AuthorReplyInboxPorts;
}

describe('collectAuthorReplyInbox', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [undefined, 24, ReplyBotPlatform.TWITTER],
    ['twitter', 24, ReplyBotPlatform.TWITTER],
    ['youtube', 48, ReplyBotPlatform.YOUTUBE],
  ] satisfies [
    Parameters<typeof collectAuthorReplyInbox>[0]['platform'],
    number,
    ReplyBotPlatform,
  ][])(
    'keeps the %s default window without an account',
    async (platform, hours, expectedPlatform) => {
      const ports = createPorts();
      ports.loadCredential.mockResolvedValue(null);

      expect(
        await collectAuthorReplyInbox({ ...scope, platform }, ports),
      ).toEqual({
        hours,
        items: [],
        platform: expectedPlatform,
      });
      expect(ports.loadCredential).toHaveBeenCalledWith(
        scope.organizationId,
        scope.brandId,
        expectedPlatform,
      );
      expect(ports.socialMonitorService.getUserTimeline).not.toHaveBeenCalled();
      expect(ports.loadProcessedCommentIds).not.toHaveBeenCalled();
    },
  );

  it('keeps the existing hard age cap', async () => {
    const ports = createPorts();
    ports.loadCredential.mockResolvedValue(null);

    expect(
      await collectAuthorReplyInbox({ ...scope, hours: 100 }, ports),
    ).toEqual({
      hours: 48,
      items: [],
      platform: 'twitter',
    });
  });

  it('does not fetch X without a handle or YouTube with a blank target', async () => {
    const ports = createPorts();
    ports.loadCredential.mockResolvedValue({ accessToken: '' });
    expect((await collectAuthorReplyInbox(scope, ports)).items).toEqual([]);

    ports.loadCredential.mockResolvedValue({
      accessToken: '',
      username: '   ',
    });
    expect(
      (await collectAuthorReplyInbox({ ...scope, platform: 'youtube' }, ports))
        .items,
    ).toEqual([]);
    expect(ports.socialMonitorService.getUserTimeline).not.toHaveBeenCalled();
  });

  it('propagates credential failures before fetching providers', async () => {
    const ports = createPorts();
    const failure = new Error('credential fixture failure');
    ports.loadCredential.mockRejectedValue(failure);

    await expect(collectAuthorReplyInbox(scope, ports)).rejects.toBe(failure);
    expect(ports.socialMonitorService.getUserTimeline).not.toHaveBeenCalled();
  });

  it('preserves tenant options, limits and sequential fetch order', async () => {
    const ports = createPorts();
    ports.socialMonitorService.getUserTimeline.mockResolvedValue([
      content({ id: 'parent-1' }),
      content({ id: 'parent-2' }),
    ]);

    await collectAuthorReplyInbox(scope, ports);

    expect(ports.socialMonitorService.getUserTimeline).toHaveBeenCalledWith(
      'twitter',
      '@Brand',
      { ...scope, limit: 12, preferOfficialApi: true },
    );
    expect(ports.loadProcessedCommentIds).toHaveBeenCalledWith(
      scope.organizationId,
    );
    expect(ports.socialMonitorService.getContentComments.mock.calls).toEqual([
      ['twitter', 'parent-1', { ...scope, limit: 40, preferOfficialApi: true }],
      ['twitter', 'parent-2', { ...scope, limit: 40, preferOfficialApi: true }],
    ]);
    const order = [
      ports.loadCredential.mock.invocationCallOrder[0],
      ports.socialMonitorService.getUserTimeline.mock.invocationCallOrder[0],
      ports.loadProcessedCommentIds.mock.invocationCallOrder[0],
      ...ports.socialMonitorService.getContentComments.mock.invocationCallOrder,
    ];
    expect(order).toEqual([...order].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it('keeps the cutoff after credential resolution and before timeline fetching', async () => {
    const ports = createPorts();
    ports.loadCredential.mockImplementation(async () => {
      vi.setSystemTime(new Date(NOW.getTime() + HOUR));
      return { accessToken: '', username: 'brand' };
    });
    ports.socialMonitorService.getUserTimeline.mockImplementation(async () => {
      vi.setSystemTime(new Date(NOW.getTime() + 72 * HOUR));
      return [content({ id: 'parent' })];
    });
    ports.socialMonitorService.getContentComments.mockResolvedValue([
      content({
        createdAt: new Date(NOW.getTime() - 23 * HOUR),
        id: 'boundary',
      }),
      content({
        createdAt: new Date(NOW.getTime() - 23 * HOUR - 1),
        id: 'old',
      }),
    ]);

    const result = await collectAuthorReplyInbox(scope, ports);

    expect(result.items.map((item) => item.commentId)).toEqual(['boundary']);
  });

  it('filters old parents, old comments, processed ids and case-insensitive self replies', async () => {
    const ports = createPorts();
    const cutoff = NOW.getTime() - 24 * HOUR;
    ports.socialMonitorService.getUserTimeline.mockResolvedValue([
      content({ createdAt: new Date(cutoff - 1), id: 'old-parent' }),
      content({ createdAt: new Date(cutoff), id: 'boundary-parent' }),
    ]);
    ports.loadProcessedCommentIds.mockResolvedValue(new Set(['processed']));
    ports.socialMonitorService.getContentComments.mockResolvedValue([
      content({ id: 'processed' }),
      content({ createdAt: new Date(cutoff - 1), id: 'old-comment' }),
      content({ authorUsername: '@bRaNd', id: 'self' }),
      content({ createdAt: new Date(cutoff), id: 'boundary-comment' }),
    ]);

    const result = await collectAuthorReplyInbox(scope, ports);

    expect(result.items.map((item) => item.commentId)).toEqual([
      'boundary-comment',
    ]);
    expect(ports.socialMonitorService.getContentComments).toHaveBeenCalledTimes(
      1,
    );
    expect(ports.socialMonitorService.getContentComments).toHaveBeenCalledWith(
      'twitter',
      'boundary-parent',
      expect.anything(),
    );
  });

  it('keeps listing-only intent labels, spam and complete parent/comment projection', async () => {
    const ports = createPorts();
    const caption = 'p'.repeat(180);
    ports.socialMonitorService.getUserTimeline.mockResolvedValue([
      content({
        contentUrl: 'https://example.invalid/parent',
        id: 'parent',
        text: caption,
      }),
    ]);
    ports.socialMonitorService.getContentComments.mockResolvedValue([
      content({
        authorDisplayName: 'Reader',
        contentUrl: 'https://example.invalid/comment',
      }),
      content({ id: 'spam', text: 'Follow me check my bio' }),
    ]);

    const result = await collectAuthorReplyInbox(scope, ports);

    expect(result.items[0]).toEqual({
      authorDisplayName: 'Reader',
      authorId: 'reader-fixture',
      authorUsername: 'reader',
      commentId: 'comment-fixture',
      commentText: 'Great point',
      commentUrl: 'https://example.invalid/comment',
      createdAt: NOW.toISOString(),
      intent: 'thanks',
      intentLabel: 'Thanks',
      parentPostId: 'parent',
      parentPostPreview: 'p'.repeat(160),
      parentPostUrl: 'https://example.invalid/parent',
      shouldSkipAuto: false,
    });
    expect(result.items[1]).toMatchObject({
      commentId: 'spam',
      intent: 'spam',
      intentLabel: 'Spam',
      shouldSkipAuto: true,
    });
  });

  it('keeps duplicate unprocessed comments and does not mutate the processed snapshot', async () => {
    const ports = createPorts();
    const processed = new Set(['already-processed']);
    ports.loadProcessedCommentIds.mockResolvedValue(processed);
    ports.socialMonitorService.getUserTimeline.mockResolvedValue([
      content({ id: 'parent-1' }),
      content({ id: 'parent-2' }),
    ]);
    ports.socialMonitorService.getContentComments.mockResolvedValue([
      content(),
    ]);

    const result = await collectAuthorReplyInbox(scope, ports);

    expect(result.items.map((item) => item.commentId)).toEqual([
      'comment-fixture',
      'comment-fixture',
    ]);
    expect([...processed]).toEqual(['already-processed']);
  });

  it('sorts globally, keeps stable ties and caps only after reading every parent', async () => {
    const ports = createPorts();
    ports.socialMonitorService.getUserTimeline.mockResolvedValue([
      content({ id: 'parent-1' }),
      content({ id: 'parent-2' }),
    ]);
    const older = Array.from({ length: 55 }, (_, index) =>
      content({
        createdAt: new Date(NOW.getTime() - HOUR),
        id: `older-${index}`,
      }),
    );
    ports.socialMonitorService.getContentComments
      .mockResolvedValueOnce(older)
      .mockResolvedValueOnce([content({ id: 'newest' })]);

    const result = await collectAuthorReplyInbox(scope, ports);

    expect(ports.socialMonitorService.getContentComments).toHaveBeenCalledTimes(
      2,
    );
    expect(result.items).toHaveLength(50);
    expect(result.items.map((item) => item.commentId)).toEqual([
      'newest',
      ...older.slice(0, 49).map((item) => item.id),
    ]);
  });

  it.each([new Error('timeline unavailable'), 'opaque failure'])(
    'returns an empty handled timeline result for %s',
    async (failure) => {
      const ports = createPorts();
      ports.socialMonitorService.getUserTimeline.mockRejectedValue(failure);

      expect(await collectAuthorReplyInbox(scope, ports)).toEqual({
        hours: 24,
        items: [],
        platform: 'twitter',
        username: '@Brand',
      });
      expect(ports.logger.warn).toHaveBeenCalledWith(
        'AuthorReplyLoopService timeline fetch failed',
        {
          error: failure instanceof Error ? 'timeline unavailable' : 'unknown',
          platform: 'twitter',
        },
      );
      expect(ports.loadProcessedCommentIds).not.toHaveBeenCalled();
    },
  );

  it('continues after a comment-fetch failure and keeps the same warning context', async () => {
    const ports = createPorts();
    ports.socialMonitorService.getUserTimeline.mockResolvedValue([
      content({ id: 'failed-parent' }),
      content({ id: 'good-parent' }),
    ]);
    ports.socialMonitorService.getContentComments
      .mockRejectedValueOnce(new Error('comments unavailable'))
      .mockResolvedValueOnce([content()]);

    const result = await collectAuthorReplyInbox(scope, ports);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.parentPostId).toBe('good-parent');
    expect(ports.logger.warn).toHaveBeenCalledWith(
      'AuthorReplyLoopService comment fetch failed',
      {
        error: 'comments unavailable',
        platform: 'twitter',
        postId: 'failed-parent',
      },
    );
  });

  it.each([
    ['brandchannel', 'https://www.youtube.com/@brandchannel'],
    [undefined, 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'],
  ])(
    'keeps YouTube channel/video URL shaping for %s',
    async (username, channelUrl) => {
      const ports = createPorts();
      ports.loadCredential.mockResolvedValue({
        accessToken: '',
        externalId: 'UCabcdefghijklmnopqrstuv',
        username,
      });
      ports.socialMonitorService.getUserTimeline.mockResolvedValue([
        content({
          contentUrl: 'https://youtube.com/watch?v=video-fixture',
          id: 'video-fixture',
        }),
      ]);
      ports.socialMonitorService.getContentComments.mockResolvedValue([
        content(),
      ]);

      await collectAuthorReplyInbox({ ...scope, platform: 'youtube' }, ports);

      expect(ports.socialMonitorService.getUserTimeline).toHaveBeenCalledWith(
        'youtube',
        channelUrl,
        expect.anything(),
      );
      expect(
        ports.socialMonitorService.getContentComments,
      ).toHaveBeenCalledWith(
        'youtube',
        'https://youtube.com/watch?v=video-fixture',
        expect.anything(),
      );
    },
  );
});
