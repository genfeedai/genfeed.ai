import { AiInfluencerWorkflowService } from '@api/services/ai-influencer/ai-influencer-workflow.service';
import {
  AI_INFLUENCER_ACTION_IDS,
  AI_INFLUENCER_WORKFLOW_DEFINITIONS,
  AI_INFLUENCER_WORKFLOW_IDS,
} from '@api/services/ai-influencer/ai-influencer-workflow-definition';

describe('AiInfluencerWorkflowService', () => {
  it('registers every atomic action and immutable graph', () => {
    const runner = {
      registerAction: vi.fn(),
      registerWorkflow: vi.fn(),
    };
    const service = new AiInfluencerWorkflowService(
      {} as never,
      runner as never,
    );

    service.onModuleInit();

    expect(runner.registerAction.mock.calls.map(([id]) => id)).toEqual(
      expect.arrayContaining(Object.values(AI_INFLUENCER_ACTION_IDS)),
    );
    expect(runner.registerAction).toHaveBeenCalledTimes(
      Object.values(AI_INFLUENCER_ACTION_IDS).length,
    );
    expect(runner.registerWorkflow).toHaveBeenCalledTimes(
      AI_INFLUENCER_WORKFLOW_DEFINITIONS.length,
    );
  });

  it('executes generate requests through the immutable post graph', async () => {
    const result = { personaSlug: 'ava' };
    const runner = {
      runWorkflow: vi.fn().mockResolvedValue({ result }),
    };
    const service = new AiInfluencerWorkflowService(
      {} as never,
      runner as never,
    );

    await expect(
      service.generatePost({
        organizationId: 'org-1',
        personaSlug: 'ava',
        platforms: ['linkedin'],
      }),
    ).resolves.toBe(result);
    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: AI_INFLUENCER_WORKFLOW_IDS.GENERATE_POST,
        organizationId: 'org-1',
      }),
    );
  });
});
