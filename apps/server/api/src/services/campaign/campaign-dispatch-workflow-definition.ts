import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { CAMPAIGN_DM_BATCH_WORKFLOW_ID } from '@api/services/campaign/campaign-dm-workflow-definition';
import { CAMPAIGN_REPLY_BATCH_WORKFLOW_ID } from '@api/services/campaign/campaign-reply-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const CAMPAIGN_DISPATCH_ACTION_IDS = {
  DISCOVER: 'campaign.dispatch.discover',
  FINALIZE: 'campaign.dispatch.finalize',
} as const;

export const CAMPAIGN_DISPATCH_WORKFLOW_ID = 'campaign.dispatch.active';

function actionNode(
  actionId: (typeof CAMPAIGN_DISPATCH_ACTION_IDS)[keyof typeof CAMPAIGN_DISPATCH_ACTION_IDS],
  id: string,
  x: number,
  y: number,
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys: ['request'],
    position: { x, y },
  });
}

function fanOutNode(
  childWorkflowId: string,
  id: string,
  x: number,
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id,
    inputVariableKeys: ['request'],
    parameters: {
      childWorkflowId,
      itemInputKey: 'request',
      mode: 'scheduled',
    },
    position: { x, y: 160 },
  });
}

export function buildCampaignDispatchWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const discover = actionNode(
    CAMPAIGN_DISPATCH_ACTION_IDS.DISCOVER,
    'discover-campaigns',
    0,
    0,
  );
  const replyFanOut = fanOutNode(
    CAMPAIGN_REPLY_BATCH_WORKFLOW_ID,
    'dispatch-reply-campaigns',
    -180,
  );
  const dmFanOut = fanOutNode(
    CAMPAIGN_DM_BATCH_WORKFLOW_ID,
    'dispatch-dm-campaigns',
    180,
  );
  const finalize = actionNode(
    CAMPAIGN_DISPATCH_ACTION_IDS.FINALIZE,
    'finalize-dispatch',
    0,
    320,
  );
  const edges: WorkflowEdge[] = [
    {
      id: 'reply-items-to-dispatch',
      source: discover.id,
      sourceHandle: 'replyItems',
      target: replyFanOut.id,
      targetHandle: 'items',
    },
    {
      id: 'dm-items-to-dispatch',
      source: discover.id,
      sourceHandle: 'dmItems',
      target: dmFanOut.id,
      targetHandle: 'items',
    },
    {
      id: 'discovery-to-finalize',
      source: discover.id,
      target: finalize.id,
      targetHandle: 'state',
    },
    {
      id: 'reply-dispatch-to-finalize',
      source: replyFanOut.id,
      target: finalize.id,
      targetHandle: 'replyBatch',
    },
    {
      id: 'dm-dispatch-to-finalize',
      source: dmFanOut.id,
      target: finalize.id,
      targetHandle: 'dmBatch',
    },
  ];

  return {
    canonicalId: CAMPAIGN_DISPATCH_WORKFLOW_ID,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: 'Active campaign dispatch request',
          required: false,
          type: 'json',
        },
      ],
      nodes: [discover, replyFanOut, dmFanOut, finalize],
    },
    description:
      'Discovers eligible outreach campaigns and durably schedules their reply or DM batch workflows.',
    label: 'Dispatch Active Campaigns',
    resultNodeId: finalize.id,
  };
}
