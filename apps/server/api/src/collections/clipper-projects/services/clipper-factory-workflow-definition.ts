import {
  buildClipperHookGate,
  CLIPPER_GENERATION_CHILD_WORKFLOW_ID,
  CLIPPER_GENERATION_PLAN_ACTION_ID,
} from '@api/collections/clipper-projects/services/clipper-generation-workflow-definition';
import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const CLIPPER_FACTORY_WORKFLOW_ID = 'clipper.factory';
export const CLIPPER_FACTORY_FAILURE_WORKFLOW_ID = 'clipper.factory.failure';

export const CLIPPER_FACTORY_ACTION_IDS = {
  FAIL: 'clipper.factory.fail',
  FINALIZE_CHILD: 'clipper.generation.finalize-child',
  PLAN_GENERATION: CLIPPER_GENERATION_PLAN_ACTION_ID,
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
      childWorkflowId: CLIPPER_GENERATION_CHILD_WORKFLOW_ID,
      itemInputKey: 'originalIndex',
      maxConcurrency: mode === 'await' ? 1 : 3,
      mode,
    },
    position: { x: 0, y: positionY },
  });
}

export function buildClipperGenerationChildWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: CLIPPER_GENERATION_CHILD_WORKFLOW_ID,
    organizationModule: 'clipper',
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
          actionId: 'clipper.generation.generate-one',
          id: 'generate-clip',
          inputVariableKeys: ['request', 'originalIndex'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: CLIPPER_FACTORY_ACTION_IDS.FINALIZE_CHILD,
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

export function buildClipperFactoryWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const gate = buildClipperHookGate(800);
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
    ...gate.edges,
  ];

  return {
    canonicalId: CLIPPER_FACTORY_WORKFLOW_ID,
    organizationModule: 'clipper',
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
          actionId: 'clipper.analysis.prepare-source',
          id: 'prepare-source',
          inputVariableKeys: ['job'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: 'clipper.analysis.transcribe',
          id: 'transcribe',
          position: { x: 0, y: 160 },
        }),
        createGenfeedActionNode({
          actionId: 'clipper.analysis.detect-highlights',
          id: 'detect-highlights',
          position: { x: 0, y: 320 },
        }),
        createGenfeedActionNode({
          actionId: CLIPPER_FACTORY_ACTION_IDS.PLAN_GENERATION,
          id: 'plan-generation',
          position: { x: 0, y: 480 },
        }),
        forEachNode('generate-hook', 'await', 640),
        ...gate.nodes,
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

export function buildClipperFactoryFailureWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: CLIPPER_FACTORY_FAILURE_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'workflowError',
          label: 'Workflow failure',
          required: true,
          type: 'string',
        },
        {
          key: 'job',
          label: 'Failed clip factory request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: CLIPPER_FACTORY_ACTION_IDS.FAIL,
          id: 'fail-factory',
          inputVariableKeys: ['job', 'workflowError'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: 'Projects terminal failure for one clip factory run.',
    label: 'Fail Clip Factory',
    resultNodeId: 'fail-factory',
    version: 2,
  };
}
