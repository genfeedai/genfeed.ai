import { describe, expect, it } from 'vitest';
import {
  buildCampaignDmBatchWorkflowDefinition,
  buildCampaignDmWorkflowDefinition,
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
  it('decomposes one reply target into ordered atomic actions', () => {
    expect(actionIds(buildCampaignReplyWorkflowDefinition())).toEqual([
      CAMPAIGN_REPLY_ACTION_IDS.CLAIM,
      CAMPAIGN_REPLY_ACTION_IDS.LOAD_CONTEXT,
      CAMPAIGN_REPLY_ACTION_IDS.GENERATE,
      CAMPAIGN_REPLY_ACTION_IDS.RESERVE,
      CAMPAIGN_REPLY_ACTION_IDS.SEND,
      CAMPAIGN_REPLY_ACTION_IDS.FINALIZE,
    ]);
  });

  it('decomposes one DM target into ordered atomic actions', () => {
    expect(actionIds(buildCampaignDmWorkflowDefinition())).toEqual([
      CAMPAIGN_DM_ACTION_IDS.CLAIM,
      CAMPAIGN_DM_ACTION_IDS.RESOLVE_CONTEXT,
      CAMPAIGN_DM_ACTION_IDS.GENERATE,
      CAMPAIGN_DM_ACTION_IDS.RESERVE,
      CAMPAIGN_DM_ACTION_IDS.SEND,
      CAMPAIGN_DM_ACTION_IDS.FINALIZE,
    ]);
  });

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
