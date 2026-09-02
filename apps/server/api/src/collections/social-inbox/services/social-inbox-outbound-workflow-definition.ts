import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const SOCIAL_INBOX_OUTBOUND_ACTION_IDS = {
  FINALIZE: 'social.inbox.outbound.finalize',
  PROVIDER: 'social.inbox.outbound.provider',
  RESERVE: 'social.inbox.outbound.reserve',
} as const;

export const SOCIAL_INBOX_OUTBOUND_WORKFLOW_IDS = {
  POST_REPLY: 'social.inbox.outbound.post-reply',
  SEND_DM: 'social.inbox.outbound.send-dm',
} as const;

function actionNode(
  actionId: (typeof SOCIAL_INBOX_OUTBOUND_ACTION_IDS)[keyof typeof SOCIAL_INBOX_OUTBOUND_ACTION_IDS],
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

export function buildSocialInboxOutboundWorkflowDefinition(
  messageType: 'dm' | 'reply',
): SystemWorkflowGraphDefinition {
  const canonicalId =
    messageType === 'dm'
      ? SOCIAL_INBOX_OUTBOUND_WORKFLOW_IDS.SEND_DM
      : SOCIAL_INBOX_OUTBOUND_WORKFLOW_IDS.POST_REPLY;
  const sequence = [
    ['reserve-message', SOCIAL_INBOX_OUTBOUND_ACTION_IDS.RESERVE],
    ['publish-message', SOCIAL_INBOX_OUTBOUND_ACTION_IDS.PROVIDER],
    ['finalize-message', SOCIAL_INBOX_OUTBOUND_ACTION_IDS.FINALIZE],
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
    canonicalId,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: 'Social inbox outbound request',
          required: true,
          type: 'json',
        },
      ],
      nodes,
    },
    description:
      'Reserves one idempotent outbound message, publishes it through the platform provider, and finalizes inbox state.',
    label:
      messageType === 'dm' ? 'Send Social Inbox DM' : 'Post Social Inbox Reply',
    resultNodeId: 'finalize-message',
  };
}
