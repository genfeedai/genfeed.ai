import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import { TwitterPipelineService } from '@api/services/twitter-pipeline/twitter-pipeline.service';
import { TWITTER_PIPELINE_ACTION_IDS } from '@api/services/twitter-pipeline/twitter-pipeline-workflow-definition';

describe('TwitterPipelineService workflow boundary', () => {
  const runner = {
    registerAction: vi.fn(),
    runWorkflow: vi.fn(),
  };
  const harness = { formatBrief: vi.fn(), resolveBrief: vi.fn() };
  const caller = {
    apiKeyId: 'key-1',
    isApiKey: true,
    scopes: ['posts:draft'],
    userId: 'user-1',
  };
  const voiceConfig = {
    description: 'Technical',
    handle: '@brand',
    searchQuery: 'AI',
  };
  const service = new TwitterPipelineService(
    { error: vi.fn(), log: vi.fn() } as never,
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

  it('routes generation through the multi-node draft workflow', async () => {
    runner.runWorkflow.mockResolvedValueOnce({ result: [] });

    await service.draft('org-1', [], voiceConfig, undefined, caller);

    expect(harness.resolveBrief).not.toHaveBeenCalled();
    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'twitter.pipeline.draft',
        inputValues: {
          request: { organizationId: 'org-1', searchResults: [], voiceConfig },
        },
        organizationId: 'org-1',
      }),
    );
  });

  it('resolves the brand brief for the caller, not the workflow owner', async () => {
    harness.resolveBrief.mockResolvedValueOnce({ id: 'brief' });
    harness.formatBrief.mockReturnValueOnce('BRAND BRIEF: dry, concrete.');
    runner.runWorkflow.mockResolvedValueOnce({ result: [] });

    await service.draft('org-1', [], voiceConfig, 'brand-1', caller);

    expect(harness.resolveBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: 'key-1',
        brandId: 'brand-1',
        isApiKey: true,
        organizationId: 'org-1',
        platform: 'twitter',
        scopes: ['posts:draft'],
        userId: 'user-1',
      }),
    );
    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        inputValues: {
          request: expect.objectContaining({
            brandBrief: 'BRAND BRIEF: dry, concrete.',
            brandId: 'brand-1',
          }),
        },
      }),
    );
  });

  it('fails with a retryable 503 before the workflow when the brief is unavailable', async () => {
    harness.resolveBrief.mockResolvedValueOnce({ id: 'brief' });
    harness.formatBrief.mockReturnValueOnce('  ');

    await expect(
      service.draft('org-1', [], voiceConfig, 'brand-1', caller),
    ).rejects.toThrow('Brand context is unavailable');
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
  const harness = { formatBrief: vi.fn(), resolveBrief: vi.fn() };

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
      harness as never,
    );
    harness.resolveBrief.mockResolvedValue({ id: 'brief' });
    harness.formatBrief.mockReturnValue('BRAND BRIEF: dry, concrete.');
    service.onModuleInit();
  });

  const voiceConfig = {
    description: 'Technical',
    handle: '@brand',
    searchQuery: 'AI',
  };
  const buildPrompt = (request: Record<string, unknown>) =>
    actions.get(TWITTER_PIPELINE_ACTION_IDS.DRAFT_BUILD_PROMPT)?.({
      input: { request },
    }) as Promise<{ prompt: string }>;

  it('writes the drafts against the brief the request carries', async () => {
    const built = await buildPrompt({
      brandBrief: 'BRAND BRIEF: dry, concrete.',
      brandId: 'brand-1',
      organizationId: 'org-1',
      searchResults,
      voiceConfig,
    });

    expect(harness.resolveBrief).not.toHaveBeenCalled();
    expect(built.prompt).toContain('BRAND BRIEF: dry, concrete.');
  });

  it('adds no brief when no brand is given', async () => {
    const built = await buildPrompt({ searchResults, voiceConfig });

    expect(built.prompt).not.toContain('Brand brief');
  });

  it('lets the model skip tweets it has nothing to add to', async () => {
    const built = await buildPrompt({ searchResults, voiceConfig });

    expect(built.prompt).not.toContain('Generate exactly');
    expect(built.prompt).toContain(
      'Skip a tweet when you have nothing specific to add',
    );
  });

  it('drops a suggestion over the 280 character limit', async () => {
    const opportunities = (await actions.get(
      TWITTER_PIPELINE_ACTION_IDS.DRAFT_PARSE,
    )?.({
      input: {
        draftContext: { searchResults },
        generation: {
          opportunities: [
            {
              reason: 'Too long',
              suggestedText: 'x'.repeat(281),
              type: 'original',
            },
            {
              reason: 'Fits',
              suggestedText: 'Short and sharp',
              type: 'original',
            },
          ],
        },
      },
    })) as Array<{ suggestedText: string }>;

    expect(opportunities.map((entry) => entry.suggestedText)).toEqual([
      'Short and sharp',
    ]);
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
          searchResults,
          voiceConfig: {
            description: 'Technical',
            handle: '@brand',
            searchQuery: 'AI',
          },
        },
      },
    })) as { prompt: string };

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
