import type { WorkflowEdge } from '@api/collections/workflows/schemas/workflow.schema';
import { requestActionNode } from '@api/collections/workflows/services/workflow-definition-nodes';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const CAMPAIGN_DM_ACTION_IDS = {
  CLAIM: 'campaign.dm.claim',
  DISCOVER_TARGETS: 'campaign.dm.discover-targets',
  FINALIZE: 'campaign.dm.finalize',
  GENERATE: 'campaign.dm.generate',
  RESERVE: 'campaign.dm.reserve',
  RESOLVE_CONTEXT: 'campaign.dm.resolve-context',
  SEND: 'campaign.dm.send',
} as const;

export const CAMPAIGN_DM_WORKFLOW_ID = 'campaign.dm.execute-target';
export const CAMPAIGN_DM_BATCH_WORKFLOW_ID =
  'campaign.dm.process-pending-targets';

export function buildCampaignDmWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const sequence = [
    ['claim-target', CAMPAIGN_DM_ACTION_IDS.CLAIM],
    ['resolve-context', CAMPAIGN_DM_ACTION_IDS.RESOLVE_CONTEXT],
    ['generate-dm', CAMPAIGN_DM_ACTION_IDS.GENERATE],
    ['reserve-slot', CAMPAIGN_DM_ACTION_IDS.RESERVE],
    ['send-dm', CAMPAIGN_DM_ACTION_IDS.SEND],
    ['finalize-target', CAMPAIGN_DM_ACTION_IDS.FINALIZE],
  ] as const;
  const nodes = sequence.map(([id, actionId], index) =>
    requestActionNode(actionId, id, index * 160),
  );
  const edges: WorkflowEdge[] = sequence.slice(1).map(([id], index) => ({
    id: `${sequence[index]?.[0]}-to-${id}`,
    source: sequence[index]?.[0] ?? '',
    target: id,
    targetHandle: 'state',
  }));

  return {
    canonicalId: CAMPAIGN_DM_WORKFLOW_ID,
    organizationModule: 'messages',
    moduleCompletionNodeIds: ['finalize-target'],
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: 'Campaign DM target request',
          required: true,
          type: 'json',
        },
      ],
      nodes,
    },
    description:
      'Claims, resolves, generates, reserves, sends, and finalizes one campaign DM target.',
    label: 'Campaign DM Target',
    resultNodeId: 'finalize-target',
  };
}

export function buildCampaignDmBatchWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const discovery = requestActionNode(
    CAMPAIGN_DM_ACTION_IDS.DISCOVER_TARGETS,
    'discover-targets',
    0,
  );
  const fanOut = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'dispatch-target-workflows',
    inputVariableKeys: ['request'],
    parameters: {
      childWorkflowId: CAMPAIGN_DM_WORKFLOW_ID,
      itemInputKey: 'request',
      mode: 'scheduled',
    },
    position: { x: 0, y: 160 },
  });
  return {
    canonicalId: CAMPAIGN_DM_BATCH_WORKFLOW_ID,
    organizationModule: 'messages',
    definition: {
      edges: [
        {
          id: 'targets-to-dispatch',
          source: discovery.id,
          sourceHandle: 'items',
          target: fanOut.id,
          targetHandle: 'items',
        },
        {
          id: 'pacing-to-dispatch',
          source: discovery.id,
          sourceHandle: 'interItemDelayMs',
          target: fanOut.id,
          targetHandle: 'interItemDelayMs',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Campaign pending-DM request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [discovery, fanOut],
    },
    description:
      'Discovers pending campaign DM targets and durably schedules one child workflow per recipient.',
    label: 'Campaign DM Batch',
    resultNodeId: fanOut.id,
  };
}
