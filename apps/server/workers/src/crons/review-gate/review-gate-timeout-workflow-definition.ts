import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const REVIEW_GATE_TIMEOUT_ACTION_IDS = {
  DISCOVER: 'review-gate.timeout.discover',
  RESOLVE: 'review-gate.timeout.resolve',
} as const;

export const REVIEW_GATE_TIMEOUT_WORKFLOW_IDS = {
  RESOLVE: 'review-gate.timeout.resolve',
  SWEEP: 'review-gate.timeout.sweep',
} as const;

function actionNode(
  actionId: string,
  id: string,
  y: number,
  inputVariableKeys: string[] = [],
  parameters: Record<string, unknown> = {},
) {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys,
    parameters,
    position: { x: 0, y },
  });
}

export function buildReviewGateTimeoutSweepDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: REVIEW_GATE_TIMEOUT_WORKFLOW_IDS.SWEEP,
    definition: {
      edges: [
        {
          id: 'discover-resolve',
          source: 'discover',
          sourceHandle: 'items',
          target: 'resolve',
          targetHandle: 'items',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Sweep request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        actionNode(REVIEW_GATE_TIMEOUT_ACTION_IDS.DISCOVER, 'discover', 0, [
          'request',
        ]),
        actionNode('workflow.for-each-tenant', 'resolve', 180, [], {
          childWorkflowId: REVIEW_GATE_TIMEOUT_WORKFLOW_IDS.RESOLVE,
          itemInputKey: 'request',
          maxConcurrency: 5,
          mode: 'await',
        }),
      ],
    },
    description:
      'Discovers expired review gates and resolves each in a child workflow.',
    label: 'Review Gate Timeout Sweep',
    resultNodeId: 'resolve',
    version: 1,
  };
}

export function buildReviewGateTimeoutResolveDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: REVIEW_GATE_TIMEOUT_WORKFLOW_IDS.RESOLVE,
    definition: {
      edges: [],
      inputVariables: [
        { key: 'request', label: 'Review gate', required: true, type: 'json' },
      ],
      nodes: [
        actionNode(REVIEW_GATE_TIMEOUT_ACTION_IDS.RESOLVE, 'resolve', 0, [
          'request',
        ]),
      ],
    },
    description:
      'Resolves one expired review gate using its configured timeout policy.',
    label: 'Resolve Review Gate Timeout',
    resultNodeId: 'resolve',
    version: 1,
  };
}
