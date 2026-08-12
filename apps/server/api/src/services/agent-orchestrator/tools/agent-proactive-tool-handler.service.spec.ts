import { AgentProactiveToolHandler } from '@api/services/agent-orchestrator/tools/agent-proactive-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { describe, expect, it, vi } from 'vitest';

const context: ToolExecutionContext = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

describe('AgentProactiveToolHandler', () => {
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
});
