import { SOCIAL_INBOX_OUTBOUND_ACTION_IDS } from '@api/collections/social-inbox/services/social-inbox-outbound-workflow-definition';
import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const SOCIAL_REPLY_CAMPAIGN_ACTION_IDS = {
  CLAIM: 'social.reply-campaign.claim',
  FINALIZE: 'social.reply-campaign.finalize',
  LOAD: 'social.reply-campaign.load',
  PREPARE: 'social.reply-campaign.prepare',
  RECLAIM: 'social.reply-campaign.reclaim',
  THROTTLE: 'social.reply-campaign.throttle',
} as const;

export const SOCIAL_REPLY_CAMPAIGN_WORKFLOW_ID =
  'social.reply-campaign.dispatch-tick';

function actionNode(
  actionId:
    | (typeof SOCIAL_REPLY_CAMPAIGN_ACTION_IDS)[keyof typeof SOCIAL_REPLY_CAMPAIGN_ACTION_IDS]
    | (typeof SOCIAL_INBOX_OUTBOUND_ACTION_IDS)[keyof typeof SOCIAL_INBOX_OUTBOUND_ACTION_IDS],
  id: string,
  y: number,
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys: ['request'],
    position: { x: 0, y },
  });
}

export function buildSocialReplyCampaignWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const sequence = [
    ['load-campaign', SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.LOAD],
    ['reclaim-stale', SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.RECLAIM],
    ['evaluate-throttle', SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.THROTTLE],
    ['claim-recipient', SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.CLAIM],
    ['prepare-message', SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.PREPARE],
    ['reserve-message', SOCIAL_INBOX_OUTBOUND_ACTION_IDS.RESERVE],
    ['publish-message', SOCIAL_INBOX_OUTBOUND_ACTION_IDS.PROVIDER],
    ['finalize-message', SOCIAL_INBOX_OUTBOUND_ACTION_IDS.FINALIZE],
    ['finalize-tick', SOCIAL_REPLY_CAMPAIGN_ACTION_IDS.FINALIZE],
  ] as const;
  const nodes = sequence.map(([id, actionId], index) =>
    actionNode(actionId, id, index * 160),
  );
  const edges: WorkflowEdge[] = sequence.slice(1).map(([id], index) => ({
    id: `${sequence[index]?.[0]}-to-${id}`,
    source: sequence[index]?.[0] ?? '',
    target: id,
    targetHandle: 'state',
  }));
  return {
    canonicalId: SOCIAL_REPLY_CAMPAIGN_WORKFLOW_ID,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: 'Social reply campaign tick',
          required: true,
          type: 'json',
        },
      ],
      nodes,
    },
    description:
      'Loads, reclaims, throttles, claims, prepares, sends, and finalizes one social campaign recipient tick.',
    label: 'Social Reply Campaign Tick',
    resultNodeId: 'finalize-tick',
  };
}
