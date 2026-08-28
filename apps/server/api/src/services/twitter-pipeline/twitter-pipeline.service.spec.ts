import { TwitterPipelineService } from '@api/services/twitter-pipeline/twitter-pipeline.service';
import { TWITTER_PIPELINE_ACTION_IDS } from '@api/services/twitter-pipeline/twitter-pipeline-workflow-definition';

describe('TwitterPipelineService workflow boundary', () => {
  const runner = {
    registerAction: vi.fn(),
    runWorkflow: vi.fn(),
  };
  const service = new TwitterPipelineService(
    { error: vi.fn(), log: vi.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    runner as never,
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
      }),
      expect.objectContaining({
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

    await service.draft('org-1', [], {
      description: 'Technical',
      handle: '@brand',
      searchQuery: 'AI',
    });

    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'twitter.pipeline.draft',
        organizationId: 'org-1',
      }),
    );
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
            targetTweetId: undefined,
            text: 'Hello',
            type: 'original',
          },
        },
      }),
    );
  });
});
