import { describe, expect, it } from 'vitest';
import {
  buildCampaignDmBatchWorkflowDefinition,
  CAMPAIGN_DM_ACTION_IDS,
  CAMPAIGN_DM_WORKFLOW_ID,
} from './campaign-dm-workflow-definition';
import {
  buildCampaignReplyBatchWorkflowDefinition,
  buildCampaignReplyWorkflowDefinition,
  CAMPAIGN_REPLY_ACTION_IDS,
  CAMPAIGN_REPLY_WORKFLOW_ID,
} from './campaign-reply-workflow-definition';

function actionIds(
  definition: ReturnType<typeof buildCampaignReplyWorkflowDefinition>,
): string[] {
  return definition.definition.nodes.map((node) =>
    String(node.data.config.actionId),
  );
}

describe('campaign workflow definitions', () => {
  it('fans discovered reply targets into the registered child workflow', () => {
    const definition = buildCampaignReplyBatchWorkflowDefinition();
    expect(actionIds(definition)).toEqual([
      CAMPAIGN_REPLY_ACTION_IDS.DISCOVER_TARGETS,
      'workflow.for-each',
    ]);
    expect(
      definition.definition.nodes[1]?.data.config.parameters,
    ).toMatchObject({
      childWorkflowId: CAMPAIGN_REPLY_WORKFLOW_ID,
      itemInputKey: 'request',
      mode: 'scheduled',
    });
  });

  it('fans discovered DM targets into the registered child workflow', () => {
    const definition = buildCampaignDmBatchWorkflowDefinition();
    expect(actionIds(definition)).toEqual([
      CAMPAIGN_DM_ACTION_IDS.DISCOVER_TARGETS,
      'workflow.for-each',
    ]);
    expect(
      definition.definition.nodes[1]?.data.config.parameters,
    ).toMatchObject({
      childWorkflowId: CAMPAIGN_DM_WORKFLOW_ID,
      itemInputKey: 'request',
      mode: 'scheduled',
    });
  });
});
