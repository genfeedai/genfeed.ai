import { AgentProactiveToolHandler } from '@api/services/agent-orchestrator/tools/agent-proactive-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
  Platform,
} from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

const context: ToolExecutionContext = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

describe('AgentProactiveToolHandler', () => {
  it('reads latest real analytics scoped to the calling strategy and brand', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        postId: 'post-1',
        platform: 'INSTAGRAM',
        post: { description: 'Hook' },
        totalLikes: 8,
        totalComments: 2,
        totalShares: 3,
        totalSaves: 1,
        totalViews: 200,
      },
    ]);
    const handler = new AgentProactiveToolHandler(
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      { postAnalytics: { findMany } } as never,
    );
    const result = await handler.analyzePerformance(
      { days: 7 },
      { ...context, strategyId: 'agent-1' },
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        distinct: ['postId'],
        where: expect.objectContaining({
          organizationId: 'org-1',
          isDeleted: false,
          post: expect.objectContaining({
            organizationId: 'org-1',
            brandId: 'brand-1',
            agentStrategyId: 'agent-1',
            isDeleted: false,
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        totalPosts: 1,
        topPerformers: [
          { id: 'post-1', engagement: 14, views: 200, platform: 'instagram' },
        ],
      },
    });
    await expect(
      handler.analyzePerformance({ days: -1 }, context),
    ).resolves.toMatchObject({ success: false });
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('resolves TwitterService lazily for X engagement discovery', async () => {
    const twitterService = {
      searchRecentTweets: vi.fn().mockResolvedValue([
        {
          authorUsername: 'genfeed',
          engagement: 12,
          id: '12345',
          text: 'Agent-native content operations',
        },
      ]),
    };
    const moduleRef = {
      get: vi.fn().mockReturnValue(twitterService),
    };
    const handler = new AgentProactiveToolHandler(
      { error: vi.fn() } as never,
      {} as never,
      undefined,
      undefined,
      moduleRef as never,
    );

    const result = await handler.discoverEngagements(
      { keywords: ['agents'], limit: 10, platform: 'x' },
      context,
    );

    expect(moduleRef.get).toHaveBeenCalledWith(TwitterService, {
      strict: false,
    });
    expect(twitterService.searchRecentTweets).toHaveBeenCalledWith('agents', {
      maxResults: 10,
      sortOrder: 'relevancy',
    });
    expect(result).toMatchObject({
      creditsUsed: 1,
      data: { count: 1, platform: 'twitter' },
      success: true,
    });
  });

  it('maps X tier-limit failures instead of returning empty success', async () => {
    const twitterService = {
      searchRecentTweets: vi.fn().mockRejectedValue({
        code: 453,
        message: 'You currently have access to a subset of X API V2 endpoints',
      }),
    };
    const handler = new AgentProactiveToolHandler(
      { error: vi.fn() } as never,
      {} as never,
      twitterService as never,
    );

    const result = await handler.discoverEngagements(
      { keywords: ['agents'], platform: 'twitter' },
      context,
    );

    expect(result).toMatchObject({
      creditsUsed: 0,
      success: false,
    });
    expect(result.error).toMatch(/cannot do that yet/i);
  });

  it('fails closed when the X integration is unavailable', async () => {
    const handler = new AgentProactiveToolHandler(
      { error: vi.fn() } as never,
      {} as never,
      undefined,
      undefined,
      {
        get: vi.fn(() => {
          throw new Error('missing provider');
        }),
      } as never,
    );

    const result = await handler.discoverEngagements(
      { keywords: ['agents'], platform: 'twitter' },
      context,
    );

    expect(result).toEqual({
      creditsUsed: 0,
      error: 'X integration is unavailable right now.',
      success: false,
    });
  });

  it('drafts an engagement reply directly into the manual review queue', async () => {
    const createManualReviewTurboRun = vi
      .fn()
      .mockResolvedValue({ id: 'batch-1' });
    const handler = new AgentProactiveToolHandler(
      { error: vi.fn() } as never,
      {} as never,
      undefined,
      { createManualReviewTurboRun } as never,
    );

    const result = await handler.draftEngagementReply(
      {
        platform: 'x',
        replyContent: 'Nice take',
        targetAuthor: 'someone',
        targetPostContent: 'Original post',
        targetPostId: '123',
        targetPostUrl: 'https://x.com/someone/status/123',
      },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ turboRunId: 'batch-1' });
    expect(createManualReviewTurboRun).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        items: [
          expect.objectContaining({
            caption: 'Nice take',
            format: 'post',
            platform: Platform.TWITTER,
            targetAuthor: 'someone',
            targetPostContent: 'Original post',
            targetPostId: '123',
            targetPostUrl: 'https://x.com/someone/status/123',
            type: 'engagement',
          }),
        ],
      }),
      context.userId,
      context.organizationId,
    );
  });

  it('does not swallow failures from the manual review batch call', async () => {
    const createManualReviewTurboRun = vi
      .fn()
      .mockRejectedValue(new Error('batch creation failed'));
    const handler = new AgentProactiveToolHandler(
      { error: vi.fn() } as never,
      {} as never,
      undefined,
      { createManualReviewTurboRun } as never,
    );

    const result = await handler.draftEngagementReply(
      {
        platform: 'twitter',
        replyContent: 'Nice take',
        targetPostId: '123',
      },
      context,
    );

    expect(result).toEqual({
      creditsUsed: 0,
      error: 'batch creation failed',
      success: false,
    });
  });

  const principal = {
    isApiKey: false,
    organizationId: 'org-1',
    scopes: [] as string[],
    userId: 'user-1',
  };

  function saveHandler(input: {
    create?: ReturnType<typeof vi.fn>;
    findFirst?: ReturnType<typeof vi.fn>;
    findOneById?: ReturnType<typeof vi.fn>;
    patch?: ReturnType<typeof vi.fn>;
    withPrisma?: boolean;
    withService?: boolean;
  }) {
    const prisma =
      input.withPrisma === false
        ? undefined
        : {
            brand: {
              findFirst:
                input.findFirst ?? vi.fn().mockResolvedValue({ id: 'brand-1' }),
            },
          };
    const service =
      input.withService === false
        ? undefined
        : {
            create:
              input.create ??
              vi.fn().mockResolvedValue({
                brandId: 'brand-1',
                id: 'strategy-1',
                label: 'Launch writer',
              }),
            findOneById:
              input.findOneById ??
              vi.fn().mockResolvedValue({
                brandId: 'brand-1',
                id: 'strategy-1',
                label: 'Launch writer',
              }),
            patch:
              input.patch ??
              vi.fn().mockResolvedValue({
                brandId: 'brand-1',
                id: 'strategy-1',
                label: 'Launch writer',
              }),
          };
    return new AgentProactiveToolHandler(
      { error: vi.fn() } as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      prisma as never,
      service as never,
    );
  }

  it('creates a supervised content agent for the authenticated brand', async () => {
    const create = vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      id: 'strategy-1',
      label: 'Launch writer',
    });
    const handler = saveHandler({ create });

    const result = await handler.saveContentAgent(
      {
        brandId: 'brand-1',
        label: 'Launch writer',
        organizationId: 'other-org',
        platforms: ['x'],
        userId: 'attacker',
      },
      { ...context, initiatingPrincipal: principal },
    );

    expect(result).toMatchObject({
      data: {
        autoPublishEnabled: false,
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        id: 'strategy-1',
        mode: 'created',
        scheduleBound: true,
      },
      success: true,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: AgentType.GENERAL,
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        brandId: 'brand-1',
        dailyCreditBudget: 100,
        isActive: true,
        label: 'Launch writer',
        organizationId: 'org-1',
        platforms: [Platform.TWITTER],
        postsPerWeek: 7,
        publishPolicy: { autoPublishEnabled: false },
        runFrequency: AgentRunFrequency.DAILY,
        schedulePrincipal: principal,
        userId: 'user-1',
      }),
    );
  });

  it('turns on auto-publish only when the caller explicitly allows it', async () => {
    const create = vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      id: 'strategy-2',
      label: 'Live writer',
    });
    const handler = saveHandler({ create });

    await handler.saveContentAgent(
      { autoPublish: true, brandId: 'brand-1', label: 'Live writer' },
      { ...context, initiatingPrincipal: principal },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
        publishPolicy: { autoPublishEnabled: true },
      }),
    );
  });

  it('rejects a schedule principal from another organization', async () => {
    const create = vi.fn();
    const handler = saveHandler({ create });

    const result = await handler.saveContentAgent(
      { brandId: 'brand-1', label: 'Launch writer' },
      {
        ...context,
        initiatingPrincipal: { ...principal, organizationId: 'other-org' },
      },
    );

    expect(result).toMatchObject({ success: false });
    expect(create).not.toHaveBeenCalled();
  });

  it('fails closed when persistence is unavailable', async () => {
    const withoutPrisma = saveHandler({ withPrisma: false });
    const withoutService = saveHandler({ withService: false });

    await expect(
      withoutPrisma.saveContentAgent(
        { brandId: 'brand-1', label: 'Launch writer' },
        context,
      ),
    ).resolves.toMatchObject({
      error: 'Content agent save is unavailable',
      success: false,
    });
    await expect(
      withoutService.saveContentAgent(
        { brandId: 'brand-1', label: 'Launch writer' },
        context,
      ),
    ).resolves.toMatchObject({
      error: 'Content agent save is unavailable',
      success: false,
    });
  });

  it('updates only the fields the caller provided', async () => {
    const patch = vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      id: 'strategy-1',
      label: 'Launch writer',
    });
    const handler = saveHandler({ patch });

    const result = await handler.saveContentAgent(
      { postsPerWeek: 3, strategyId: 'strategy-1' },
      { ...context, initiatingPrincipal: principal },
    );

    expect(result).toMatchObject({
      data: { id: 'strategy-1', mode: 'updated' },
      success: true,
    });
    expect(result.data).not.toHaveProperty('autonomyMode');
    const update = patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(update).toMatchObject({
      postsPerWeek: 3,
      schedulePrincipal: principal,
    });
    expect(update).not.toHaveProperty('autonomyMode');
    expect(update).not.toHaveProperty('publishPolicy');
    expect(update).not.toHaveProperty('label');
  });

  it('rejects an update that moves the agent to another brand', async () => {
    const patch = vi.fn();
    const handler = saveHandler({
      findFirst: vi.fn().mockResolvedValue({ id: 'brand-2' }),
      patch,
    });

    const result = await handler.saveContentAgent(
      { brandId: 'brand-2', postsPerWeek: 3, strategyId: 'strategy-1' },
      { ...context, brandId: undefined },
    );

    expect(result).toMatchObject({
      error: 'brandId does not match this content agent',
      success: false,
    });
    expect(patch).not.toHaveBeenCalled();
  });
});
