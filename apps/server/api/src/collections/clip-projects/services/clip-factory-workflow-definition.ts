import {
  CLIP_GENERATION_CHILD_WORKFLOW_ID,
  CLIP_GENERATION_PLAN_ACTION_ID,
  CLIP_HOOK_REVIEW_NODE_ID,
} from '@api/collections/clip-projects/services/clip-generation-workflow-definition';
import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const CLIP_FACTORY_WORKFLOW_ID = 'clip.factory';
export const CLIP_FACTORY_FAILURE_WORKFLOW_ID = 'clip.factory.failure';

export const CLIP_FACTORY_ACTION_IDS = {
  FAIL: 'clip.factory.fail',
  FINALIZE_CHILD: 'clip.generation.finalize-child',
  PLAN_GENERATION: CLIP_GENERATION_PLAN_ACTION_ID,
} as const;

function forEachNode(
  id: string,
  mode: 'await' | 'scheduled',
  positionY: number,
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id,
    parameters: {
      childWorkflowId: CLIP_GENERATION_CHILD_WORKFLOW_ID,
      itemInputKey: 'originalIndex',
      maxConcurrency: mode === 'await' ? 1 : 3,
      mode,
    },
    position: { x: 0, y: positionY },
  });
}

export function buildClipGenerationChildWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: CLIP_GENERATION_CHILD_WORKFLOW_ID,
    definition: {
      inputVariables: [
        {
          key: 'request',
          label: 'Clip generation request',
          required: true,
          type: 'json',
        },
        {
          key: 'originalIndex',
          label: 'Original highlight index',
          required: true,
          type: 'number',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: 'clip.generation.generate-one',
          id: 'generate-clip',
          inputVariableKeys: ['request', 'originalIndex'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: CLIP_FACTORY_ACTION_IDS.FINALIZE_CHILD,
          id: 'finalize-child',
          inputVariableKeys: ['request', 'originalIndex'],
          position: { x: 0, y: 160 },
        }),
      ],
      edges: [
        {
          id: 'generation-to-finalization',
          source: 'generate-clip',
          target: 'finalize-child',
          targetHandle: 'generation',
        },
        {
          id: 'generation-failure-to-finalization',
          source: 'generate-clip',
          sourceHandle: 'failure',
          target: 'finalize-child',
          targetHandle: 'failure',
        },
      ],
    },
    description: 'Creates and dispatches exactly one discovered clip.',
    label: 'Generate One Clip',
    resultNodeId: 'finalize-child',
    version: 1,
  };
}

export function buildClipFactoryWorkflowDefinition(): SystemWorkflowGraphDefinition {
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
    position: { x: 0, y: 800 },
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
    position: { x: 0, y: 960 },
    type: 'reviewGate',
  };
  const edges: WorkflowEdge[] = [
    {
      id: 'prepare-to-transcribe',
      source: 'prepare-source',
      target: 'transcribe',
      targetHandle: 'prepared',
    },
    {
      id: 'transcribe-to-highlights',
      source: 'transcribe',
      target: 'detect-highlights',
      targetHandle: 'transcribed',
    },
    {
      id: 'highlights-to-plan',
      source: 'detect-highlights',
      target: 'plan-generation',
      targetHandle: 'highlighted',
    },
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
    canonicalId: CLIP_FACTORY_WORKFLOW_ID,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'job',
          label: 'Clip factory request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: 'clip.analysis.prepare-source',
          id: 'prepare-source',
          inputVariableKeys: ['job'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: 'clip.analysis.transcribe',
          id: 'transcribe',
          position: { x: 0, y: 160 },
        }),
        createGenfeedActionNode({
          actionId: 'clip.analysis.detect-highlights',
          id: 'detect-highlights',
          position: { x: 0, y: 320 },
        }),
        createGenfeedActionNode({
          actionId: CLIP_FACTORY_ACTION_IDS.PLAN_GENERATION,
          id: 'plan-generation',
          position: { x: 0, y: 480 },
        }),
        forEachNode('generate-hook', 'await', 640),
        conditionNode,
        reviewNode,
        forEachNode('generate-remaining', 'scheduled', 1120),
      ],
    },
    description:
      'Transcribes one clip source, detects highlights, gates the hook when required, and schedules one child workflow per remaining clip.',
    label: 'Clip Factory',
    resultNodeId: 'generate-remaining',
    version: 1,
  };
}

export function buildClipFactoryFailureWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: CLIP_FACTORY_FAILURE_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'job',
          label: 'Failed clip factory request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: CLIP_FACTORY_ACTION_IDS.FAIL,
          id: 'fail-factory',
          inputVariableKeys: ['job'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: 'Projects terminal failure for one clip factory run.',
    label: 'Fail Clip Factory',
    resultNodeId: 'fail-factory',
    version: 1,
  };
}
