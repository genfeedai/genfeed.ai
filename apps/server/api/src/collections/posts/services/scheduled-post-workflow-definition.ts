import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const SCHEDULED_POST_ACTION_IDS = {
  CLAIM: 'scheduled-post.claim',
  DELIVER: 'scheduled-post.deliver',
  FAIL: 'scheduled-post.fail',
  FINALIZE: 'scheduled-post.finalize',
} as const;

export const SCHEDULED_POST_WORKFLOW_ID = 'scheduled-post.publish';
export const SCHEDULED_POST_FAILURE_WORKFLOW_ID =
  'scheduled-post.publish.failure';

export type ScheduledPostWorkflowSource =
  | 'manual_retry'
  | 'publish_now'
  | 'scheduled_sweep'
  | 'tiktok_app';

export type ScheduledPostWorkflowInput = {
  approvalId?: string;
  operationId?: string;
  organizationId: string;
  postId: string;
  source: ScheduledPostWorkflowSource;
  userId?: string;
  versionPinId?: string;
};

function actionNode(
  actionId: (typeof SCHEDULED_POST_ACTION_IDS)[keyof typeof SCHEDULED_POST_ACTION_IDS],
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

export function buildScheduledPostWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const nodes = [
    actionNode(SCHEDULED_POST_ACTION_IDS.CLAIM, 'claim-publish', 0),
    actionNode(SCHEDULED_POST_ACTION_IDS.DELIVER, 'deliver-post', 160),
    actionNode(SCHEDULED_POST_ACTION_IDS.FINALIZE, 'finalize-publish', 320),
  ];
  const edges: WorkflowEdge[] = [
    {
      id: 'claim-to-delivery',
      source: 'claim-publish',
      target: 'deliver-post',
      targetHandle: 'claim',
    },
    {
      id: 'claim-to-finalize',
      source: 'claim-publish',
      target: 'finalize-publish',
      targetHandle: 'claim',
    },
    {
      id: 'delivery-to-finalize',
      source: 'deliver-post',
      target: 'finalize-publish',
      targetHandle: 'delivery',
    },
  ];

  return {
    canonicalId: SCHEDULED_POST_WORKFLOW_ID,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: 'Scheduled publish request',
          required: true,
          type: 'json',
        },
      ],
      nodes,
    },
    description:
      'Claims an immutable publish approval, delivers the post, and finalizes its durable outcome.',
    label: 'Scheduled Post Publishing',
    resultNodeId: 'finalize-publish',
  };
}

export function buildScheduledPostFailureWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: SCHEDULED_POST_FAILURE_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'request',
          label: 'Failed scheduled publish request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [actionNode(SCHEDULED_POST_ACTION_IDS.FAIL, 'fail-publish', 0)],
    },
    description: 'Projects terminal failure for one scheduled publish.',
    label: 'Fail Scheduled Post Publishing',
    resultNodeId: 'fail-publish',
  };
}
