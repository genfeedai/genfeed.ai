import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentXActionsToolHandler } from '@api/services/agent-orchestrator/tools/agent-x-actions-tool-handler.service';
import { AgentToolName } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

describe('AgentXActionsToolHandler', () => {
  const ctx: ToolExecutionContext = {
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };

  const createHandler = () => {
    const loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    const twitterService = {
      getTweetById: vi.fn(),
      getUserTimelineByUsername: vi.fn(),
      resolveBrandUserAccessToken: vi.fn().mockResolvedValue(null),
      searchRecentTweets: vi.fn(),
    };

    const credentialsService = {
      findOne: vi.fn(),
    };

    const internalApi = {
      callInternalApi: vi.fn().mockResolvedValue({}),
    };

    const batchGenerationService = {
      createBatch: vi.fn().mockResolvedValue({ id: 'batch-1' }),
    };

    const handler = new AgentXActionsToolHandler(
      loggerService,
      twitterService as never,
      credentialsService as never,
      internalApi as never,
      batchGenerationService as never,
    );

    return {
      batchGenerationService,
      credentialsService,
      handler,
      internalApi,
      loggerService,
      twitterService,
    };
  };

  it('handles the X action tool names', () => {
    const { handler } = createHandler();
    expect(handler.handles(AgentToolName.SEARCH_X_POSTS)).toBe(true);
    expect(handler.handles(AgentToolName.FETCH_X_POST)).toBe(true);
    expect(handler.handles(AgentToolName.LIST_X_ACCOUNT_ACTIVITY)).toBe(true);
    expect(handler.handles(AgentToolName.DRAFT_X_QUOTE)).toBe(true);
    expect(handler.handles(AgentToolName.DRAFT_X_REPOST)).toBe(true);
    expect(handler.handles(AgentToolName.CREATE_POST)).toBe(false);
  });

  it('searches recent X posts', async () => {
    const { handler, twitterService } = createHandler();
    twitterService.searchRecentTweets.mockResolvedValue([
      {
        authorName: 'Genfeed',
        authorUsername: 'genfeed',
        createdAt: '2026-08-01T00:00:00.000Z',
        engagement: 12,
        id: '111',
        likes: 10,
        quotes: 0,
        replies: 1,
        retweets: 1,
        text: 'hello world',
      },
    ]);

    const result = await handler.execute(
      AgentToolName.SEARCH_X_POSTS,
      { limit: 5, query: 'genfeed' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(1);
    expect(result.data?.count).toBe(1);
    expect(result.data?.posts).toEqual([
      expect.objectContaining({
        author: 'genfeed',
        id: '111',
        url: 'https://x.com/genfeed/status/111',
      }),
    ]);
    expect(twitterService.searchRecentTweets).toHaveBeenCalledWith('genfeed', {
      maxResults: 5,
      sortOrder: 'relevancy',
    });
  });

  it('maps tier-limit failures on search instead of empty success', async () => {
    const { handler, twitterService } = createHandler();
    twitterService.searchRecentTweets.mockRejectedValue(
      new Error('403 Client Forbidden — access level'),
    );

    const result = await handler.execute(
      AgentToolName.SEARCH_X_POSTS,
      { query: 'ai' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cannot do that yet/i);
  });

  it('fetches a post by URL', async () => {
    const { handler, twitterService } = createHandler();
    twitterService.getTweetById.mockResolvedValue({
      authorUsername: 'someone',
      id: '999',
      likeCount: 3,
      replyCount: 1,
      retweetCount: 2,
      text: 'quoted',
      url: 'https://x.com/someone/status/999',
    });

    const result = await handler.execute(
      AgentToolName.FETCH_X_POST,
      { postIdOrUrl: 'https://x.com/someone/status/999?s=20' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(twitterService.getTweetById).toHaveBeenCalledWith('999', {
      brandId: 'brand-1',
      organizationId: 'org-1',
    });
    expect(result.data?.id).toBe('999');
  });

  it('rejects unparseable post ids', async () => {
    const { handler } = createHandler();
    const result = await handler.execute(
      AgentToolName.FETCH_X_POST,
      { postIdOrUrl: 'not-a-tweet' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not look like an X post/i);
  });

  it('lists activity for an explicit username', async () => {
    const { handler, twitterService } = createHandler();
    twitterService.getUserTimelineByUsername.mockResolvedValue([
      {
        authorUsername: 'genfeed',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        id: '1',
        isRetweet: false,
        metrics: { comments: 0, likes: 2, shares: 1 },
        text: 'post',
      },
    ]);

    const result = await handler.execute(
      AgentToolName.LIST_X_ACCOUNT_ACTIVITY,
      { limit: 10, username: '@genfeed' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.data?.username).toBe('genfeed');
    expect(result.data?.count).toBe(1);
  });

  it('drafts a quote for review', async () => {
    const { batchGenerationService, handler, internalApi } = createHandler();

    const result = await handler.execute(
      AgentToolName.DRAFT_X_QUOTE,
      {
        quoteContent: 'Great take',
        targetAuthor: 'someone',
        targetPostIdOrUrl: '1234567890',
      },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(batchGenerationService.createBatch).toHaveBeenCalled();
    expect(internalApi.callInternalApi).toHaveBeenCalledWith(
      'POST',
      '/v1/batches/batch-1/items',
      expect.objectContaining({
        engagementAction: 'quote',
        platform: 'twitter',
        targetPostId: '1234567890',
        type: 'engagement',
      }),
      ctx,
    );
  });

  it('drafts a repost for review', async () => {
    const { handler, internalApi } = createHandler();

    const result = await handler.execute(
      AgentToolName.DRAFT_X_REPOST,
      { targetPostIdOrUrl: 'https://x.com/a/status/555' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.data?.action).toBe('repost');
    expect(internalApi.callInternalApi).toHaveBeenCalledWith(
      'POST',
      '/v1/batches/batch-1/items',
      expect.objectContaining({
        engagementAction: 'repost',
        targetPostId: '555',
      }),
      ctx,
    );
  });
});
