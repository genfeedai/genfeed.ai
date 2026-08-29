import {
  buildCampaignDispatchWorkflowDefinition,
  CAMPAIGN_DISPATCH_ACTION_IDS,
} from './campaign-dispatch-workflow-definition';
import { CAMPAIGN_DM_BATCH_WORKFLOW_ID } from './campaign-dm-workflow-definition';
import { CAMPAIGN_REPLY_BATCH_WORKFLOW_ID } from './campaign-reply-workflow-definition';

describe('buildCampaignDispatchWorkflowDefinition', () => {
  it('discovers once and fans reply and DM campaigns into their batch graphs', () => {
    const definition = buildCampaignDispatchWorkflowDefinition();

    expect(definition.definition.nodes[0]?.data.config.actionId).toBe(
      CAMPAIGN_DISPATCH_ACTION_IDS.DISCOVER,
    );
    expect(definition.definition.nodes[1]?.data.config).toMatchObject({
      actionId: 'workflow.for-each',
      parameters: {
        childWorkflowId: CAMPAIGN_REPLY_BATCH_WORKFLOW_ID,
        mode: 'scheduled',
      },
    });
    expect(definition.definition.nodes[2]?.data.config).toMatchObject({
      actionId: 'workflow.for-each',
      parameters: {
        childWorkflowId: CAMPAIGN_DM_BATCH_WORKFLOW_ID,
        mode: 'scheduled',
      },
    });
    expect(definition.definition.nodes[3]?.data.config.actionId).toBe(
      CAMPAIGN_DISPATCH_ACTION_IDS.FINALIZE,
    );
  });
});
