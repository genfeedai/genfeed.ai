import type { SystemWorkflowActionExecutor } from '@api/collections/workflows/system-workflow-runner.service';
import { AgentCampaignWorkflowService } from '@api/services/agent-campaign/agent-campaign-workflow.service';
import {
  AGENT_CAMPAIGN_ACTION_IDS,
  AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS,
} from '@api/services/agent-campaign/agent-campaign-workflow-definition';

describe('AgentCampaignWorkflowService', () => {
  it('registers every atomic action and immutable graph', () => {
    const actions = new Map<string, SystemWorkflowActionExecutor>();
    const runner = {
      registerAction: vi.fn(
        (id: string, executor: SystemWorkflowActionExecutor) => {
          actions.set(id, executor);
        },
      ),
      registerWorkflow: vi.fn(),
    };
    const service = new AgentCampaignWorkflowService(
      {} as never,
      {} as never,
      {} as never,
      runner as never,
      {} as never,
    );

    service.onModuleInit();

    expect([...actions.keys()]).toEqual(
      expect.arrayContaining(Object.values(AGENT_CAMPAIGN_ACTION_IDS)),
    );
    expect(runner.registerWorkflow).toHaveBeenCalledTimes(
      AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS.length,
    );
    for (const definition of AGENT_CAMPAIGN_WORKFLOW_DEFINITIONS) {
      expect(runner.registerWorkflow).toHaveBeenCalledWith(definition);
    }
  });
});
