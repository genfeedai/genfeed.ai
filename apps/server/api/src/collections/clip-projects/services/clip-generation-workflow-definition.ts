import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const CLIP_GENERATION_WORKFLOW_ID = 'clip.generation';
export const CLIP_GENERATION_CHILD_WORKFLOW_ID = 'clip.generation.one';
export const CLIP_GENERATION_PLAN_ACTION_ID = 'clip.generation.plan';
export const CLIP_HOOK_REVIEW_NODE_ID = 'review-hook';

function forEachNode(id: string, positionY: number): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id,
    parameters: {
      childWorkflowId: CLIP_GENERATION_CHILD_WORKFLOW_ID,
      itemInputKey: 'originalIndex',
      maxConcurrency: id === 'generate-hook' ? 1 : 3,
      mode: 'await',
    },
    position: { x: 0, y: positionY },
  });
}

export function buildClipGenerationWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const conditionNode: WorkflowVisualNode = {
    data: {
      config: {
        customField: 'hookReviewRequired',
        field: 'custom',
        operator: 'isTrue',
      },
      label: 'Hook review required?',
    },
    id: 'hook-review-required',
    position: { x: 0, y: 320 },
    type: 'condition',
  };
  const reviewNode: WorkflowVisualNode = {
    data: {
      config: {
        autoApproveIfNoResponse: false,
        timeoutHours: 24,
      },
      label: 'Review Hook Clip',
    },
    id: CLIP_HOOK_REVIEW_NODE_ID,
    position: { x: 0, y: 480 },
    type: 'reviewGate',
  };
  const edges: WorkflowEdge[] = [
    {
      id: 'plan-hook-items',
      source: 'plan-generation',
      sourceHandle: 'hookItems',
      target: 'generate-hook',
      targetHandle: 'items',
    },
    {
      id: 'plan-hook-base-input',
      source: 'plan-generation',
      sourceHandle: 'baseInput',
      target: 'generate-hook',
      targetHandle: 'baseInput',
    },
    {
      id: 'plan-to-condition',
      source: 'plan-generation',
      target: conditionNode.id,
      targetHandle: 'value',
    },
    {
      id: 'hook-to-condition',
      source: 'generate-hook',
      target: conditionNode.id,
      targetHandle: 'hookDispatch',
    },
    {
      id: 'condition-to-review',
      source: conditionNode.id,
      sourceHandle: 'true',
      target: reviewNode.id,
      targetHandle: 'condition',
    },
    {
      id: 'hook-to-review',
      source: 'generate-hook',
      target: reviewNode.id,
      targetHandle: 'media',
    },
    {
      id: 'condition-to-remaining',
      source: conditionNode.id,
      sourceHandle: 'false',
      target: 'generate-remaining',
      targetHandle: 'approval',
    },
    {
      id: 'review-to-remaining',
      source: reviewNode.id,
      target: 'generate-remaining',
      targetHandle: 'approval',
    },
    {
      id: 'plan-remaining-items',
      source: 'plan-generation',
      sourceHandle: 'remainingItems',
      target: 'generate-remaining',
      targetHandle: 'items',
    },
    {
      id: 'plan-remaining-base-input',
      source: 'plan-generation',
      sourceHandle: 'baseInput',
      target: 'generate-remaining',
      targetHandle: 'baseInput',
    },
  ];

  return {
    canonicalId: CLIP_GENERATION_WORKFLOW_ID,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'request',
          label: 'Clip generation request',
          required: true,
          type: 'json',
        },
        {
          key: 'reviewContext',
          label: 'Hook review context',
          required: false,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: CLIP_GENERATION_PLAN_ACTION_ID,
          id: 'plan-generation',
          inputVariableKeys: ['request', 'reviewContext'],
          position: { x: 0, y: 0 },
        }),
        forEachNode('generate-hook', 160),
        conditionNode,
        reviewNode,
        forEachNode('generate-remaining', 640),
      ],
    },
    description:
      'Plans clip generation, gates the hook when required, and runs one immutable child workflow per highlight.',
    label: 'Clip Generation',
    resultNodeId: 'generate-remaining',
    version: 1,
  };
}
