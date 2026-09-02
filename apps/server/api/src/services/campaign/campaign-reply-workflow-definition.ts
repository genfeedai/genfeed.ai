import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const CAMPAIGN_REPLY_ACTION_IDS = {
  CLAIM: 'campaign.reply.claim',
  DISCOVER_TARGETS: 'campaign.reply.discover-targets',
  GENERATE: 'campaign.reply.generate',
  LOAD_CONTEXT: 'campaign.reply.load-context',
  PREVIEW_GENERATE: 'campaign.reply.preview.generate',
  PREVIEW_VALIDATE: 'campaign.reply.preview.validate',
  RESERVE: 'campaign.reply.reserve',
  SEND: 'campaign.reply.send',
  FINALIZE: 'campaign.reply.finalize',
} as const;

export const CAMPAIGN_REPLY_WORKFLOW_ID = 'campaign.reply.execute-target';
export const CAMPAIGN_REPLY_BATCH_WORKFLOW_ID =
  'campaign.reply.process-pending-targets';
export const CAMPAIGN_REPLY_PREVIEW_WORKFLOW_ID = 'campaign.reply.preview';

function actionNode(
  actionId: (typeof CAMPAIGN_REPLY_ACTION_IDS)[keyof typeof CAMPAIGN_REPLY_ACTION_IDS],
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

export function buildCampaignReplyWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const sequence = [
    ['claim-target', CAMPAIGN_REPLY_ACTION_IDS.CLAIM],
    ['load-context', CAMPAIGN_REPLY_ACTION_IDS.LOAD_CONTEXT],
    ['generate-reply', CAMPAIGN_REPLY_ACTION_IDS.GENERATE],
    ['reserve-slot', CAMPAIGN_REPLY_ACTION_IDS.RESERVE],
    ['send-reply', CAMPAIGN_REPLY_ACTION_IDS.SEND],
    ['finalize-target', CAMPAIGN_REPLY_ACTION_IDS.FINALIZE],
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
    canonicalId: CAMPAIGN_REPLY_WORKFLOW_ID,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: 'Campaign reply target request',
          required: true,
          type: 'json',
        },
      ],
      nodes,
    },
    description:
      'Claims, contextualizes, generates, reserves, sends, and finalizes one campaign reply target.',
    label: 'Campaign Reply Target',
    resultNodeId: 'finalize-target',
  };
}

export function buildCampaignReplyBatchWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const discovery = actionNode(
    CAMPAIGN_REPLY_ACTION_IDS.DISCOVER_TARGETS,
    'discover-targets',
    0,
  );
  const fanOut = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'dispatch-target-workflows',
    inputVariableKeys: ['request'],
    parameters: {
      childWorkflowId: CAMPAIGN_REPLY_WORKFLOW_ID,
      itemInputKey: 'request',
      mode: 'scheduled',
    },
    position: { x: 0, y: 160 },
  });
  return {
    canonicalId: CAMPAIGN_REPLY_BATCH_WORKFLOW_ID,
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
          label: 'Campaign pending-target request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [discovery, fanOut],
    },
    description:
      'Discovers pending campaign reply targets and durably schedules one child workflow per target.',
    label: 'Campaign Reply Batch',
    resultNodeId: fanOut.id,
  };
}

export function buildCampaignReplyPreviewWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const validate = actionNode(
    CAMPAIGN_REPLY_ACTION_IDS.PREVIEW_VALIDATE,
    'validate-preview',
    0,
  );
  const generate = actionNode(
    CAMPAIGN_REPLY_ACTION_IDS.PREVIEW_GENERATE,
    'generate-preview',
    160,
  );
  return {
    canonicalId: CAMPAIGN_REPLY_PREVIEW_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'validate-to-generate',
          source: validate.id,
          target: generate.id,
          targetHandle: 'state',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Campaign reply preview request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [validate, generate],
    },
    description:
      'Validates a campaign target and generates preview copy without reserving or publishing.',
    label: 'Preview Campaign Reply',
    resultNodeId: generate.id,
  };
}
