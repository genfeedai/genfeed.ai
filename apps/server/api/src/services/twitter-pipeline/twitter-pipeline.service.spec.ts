import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import {
  TwitterPipelineService,
  X_DRAFT_BRAND_CONTEXT_UNAVAILABLE,
} from '@api/services/twitter-pipeline/twitter-pipeline.service';
import { TWITTER_PIPELINE_ACTION_IDS } from '@api/services/twitter-pipeline/twitter-pipeline-workflow-definition';
import { ServiceUnavailableException } from '@nestjs/common';

describe('TwitterPipelineService workflow boundary', () => {
  const runner = {
    registerAction: vi.fn(),
    runWorkflow: vi.fn(),
  };
  const harness = { formatBrief: vi.fn(), resolveBrief: vi.fn() };
  const user = {
    organizationId: 'org-1',
    userId: 'user-1',
  } as AuthenticatedUser;
  const voiceConfig = {
    description: 'Technical',
    handle: '@brand',
    searchQuery: 'AI',
  };
  const service = new TwitterPipelineService(
    { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    runner as never,
    harness as never,
  );

  beforeEach(() => vi.clearAllMocks());

  it('registers every reusable pipeline action', () => {
    service.onModuleInit();

    expect(runner.registerAction).toHaveBeenCalledTimes(
      Object.keys(TWITTER_PIPELINE_ACTION_IDS).length,
    );
  });

  it('routes search through the search workflow', async () => {
    runner.runWorkflow.mockResolvedValueOnce({ result: [] });

    await service.search('org-1', 'brand-1', 'AI', { maxResults: 25 });

    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'twitter.pipeline.search',
        inputValues: {
          request: {
            brandId: 'brand-1',
            maxResults: 25,
            organizationId: 'org-1',
            query: 'AI',
          },
        },
      }),
    );
  });

  it('drafts through the multi-node workflow against the harness brief', async () => {
    const brief = { appliedPacks: [] };
    harness.resolveBrief.mockResolvedValueOnce(brief);
    harness.formatBrief.mockReturnValueOnce('Guardrails: never promise cures.');
    runner.runWorkflow.mockResolvedValueOnce({ result: [] });

    await service.draft('org-1', 'brand-1', [], voiceConfig, user);

    expect(harness.resolveBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        contentType: 'reply',
        organizationId: 'org-1',
        platform: 'twitter',
        topic: 'AI',
        userId: 'user-1',
      }),
    );
    expect(harness.formatBrief).toHaveBeenCalledWith(brief);
    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'twitter.pipeline.draft',
        inputValues: {
          request: {
            brandBrief: 'Guardrails: never promise cures.',
            brandId: 'brand-1',
            organizationId: 'org-1',
            searchResults: [],
            voiceConfig,
          },
        },
        organizationId: 'org-1',
      }),
    );
  });

  it('refuses to draft without brand context, before any model call', async () => {
    harness.resolveBrief.mockResolvedValueOnce(null);
    harness.formatBrief.mockReturnValueOnce('');

    const drafting = service.draft('org-1', 'brand-1', [], voiceConfig, user);

    await expect(drafting).rejects.toThrow(ServiceUnavailableException);
    await expect(drafting).rejects.toThrow(X_DRAFT_BRAND_CONTEXT_UNAVAILABLE);
    expect(runner.runWorkflow).not.toHaveBeenCalled();
  });

  it('routes publishing through credential resolution and provider delivery', async () => {
    runner.runWorkflow.mockResolvedValueOnce({
      result: { success: true },
    });

    await service.publish('org-1', 'brand-1', {
      credentialId: 'credential-1',
      text: 'Hello',
      type: 'original',
    });

    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'twitter.pipeline.publish',
        inputValues: {
          request: {
            brandId: 'brand-1',
            credentialId: 'credential-1',
            organizationId: 'org-1',
            text: 'Hello',
            type: 'original',
          },
        },
      }),
    );
  });
});

describe('TwitterPipelineService draft actions', () => {
  type ActionHandler = (context: {
    input: Record<string, unknown>;
  }) => Promise<unknown>;

  let actions: Map<string, ActionHandler>;
  let llmDispatcherService: { completeStructured: ReturnType<typeof vi.fn> };

  const searchResults = [
    {
      authorUsername: 'alice',
      id: 'tweet-1',
      likes: 10,
      retweets: 2,
      text: 'Shipping beats planning',
    },
  ];

  beforeEach(() => {
    actions = new Map();
    llmDispatcherService = { completeStructured: vi.fn() };
    const service = new TwitterPipelineService(
      { error: vi.fn(), log: vi.fn() } as never,
      {} as never,
      llmDispatcherService as never,
      {} as never,
      {} as never,
      {
        registerAction: (id: string, handler: ActionHandler) => {
          actions.set(id, handler);
        },
        runWorkflow: vi.fn(),
      } as never,
      {} as never,
    );
    service.onModuleInit();
  });

  it('asks the dispatcher for the opportunities schema', async () => {
    llmDispatcherService.completeStructured.mockResolvedValue({
      opportunities: [],
    });

    await actions.get(TWITTER_PIPELINE_ACTION_IDS.DRAFT_GENERATE)?.({
      input: { draftContext: { prompt: 'Pick the best replies' } },
    });

    expect(llmDispatcherService.completeStructured).toHaveBeenCalledWith(
      expect.objectContaining({ schemaName: 'twitter_opportunities' }),
    );
  });

  it('stops telling the model to return bare JSON', async () => {
    const built = (await actions.get(
      TWITTER_PIPELINE_ACTION_IDS.DRAFT_BUILD_PROMPT,
    )?.({
      input: {
        request: {
          brandBrief: 'Guardrails: never promise cures.',
          searchResults,
          voiceConfig: {
            description: 'Technical',
            handle: '@brand',
            searchQuery: 'AI',
          },
        },
      },
    })) as { prompt: string };

    expect(built.prompt).toContain(
      'Brand brief (follow it exactly; never contradict its guardrails, and do not invent claims it does not support):\nGuardrails: never promise cures.',
    );
    expect(built.prompt).not.toContain('valid JSON');
    expect(built.prompt).not.toContain('no markdown fences');
  });

  it('resolves each opportunity against the real tweets', async () => {
    const opportunities = await actions.get(
      TWITTER_PIPELINE_ACTION_IDS.DRAFT_PARSE,
    )?.({
      input: {
        draftContext: { searchResults },
        generation: {
          opportunities: [
            {
              reason: 'Agrees with the voice',
              suggestedText: 'Ship it',
              tweetIndex: 1,
              type: 'reply',
            },
            {
              reason: 'Rides the theme',
              suggestedText: 'Planning is procrastination',
              type: 'original',
            },
          ],
        },
      },
    });

    expect(opportunities).toEqual([
      expect.objectContaining({
        engagement: { likes: 10, retweets: 2 },
        targetAuthor: 'alice',
        targetTweetId: 'tweet-1',
        type: 'reply',
        verified: true,
      }),
      expect.objectContaining({ type: 'original', verified: false }),
    ]);
  });

  it('leaves a reply unverified when the model points outside the batch', async () => {
    const opportunities = (await actions.get(
      TWITTER_PIPELINE_ACTION_IDS.DRAFT_PARSE,
    )?.({
      input: {
        draftContext: { searchResults },
        generation: {
          opportunities: [
            {
              reason: 'Off by a mile',
              suggestedText: 'Ship it',
              tweetIndex: 99,
              type: 'reply',
            },
          ],
        },
      },
    })) as Array<{ verified: boolean; targetTweetId?: string }>;

    expect(opportunities[0].verified).toBe(false);
    expect(opportunities[0].targetTweetId).toBeUndefined();
  });

  it('surfaces the typed error instead of drafting nothing', async () => {
    const error = new LlmStructuredOutputError('twitter_opportunities', [
      {
        code: 'invalid_value',
        message: 'Invalid option',
        path: 'opportunities.0.type',
      },
    ]);
    llmDispatcherService.completeStructured.mockRejectedValue(error);

    await expect(
      actions.get(TWITTER_PIPELINE_ACTION_IDS.DRAFT_GENERATE)?.({
        input: { draftContext: { prompt: 'Pick the best replies' } },
      }),
    ).rejects.toBe(error);
  });
});
