import { createGenfeedActionNode } from '@genfeedai/actions';
import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@server/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@server/collections/workflows/system-workflow-runner.service';

export const CLIP_CONTINUITY_ACTION_IDS = {
  BEGIN: 'clip.continuity.begin',
  FAIL: 'clip.continuity.fail',
  PERSIST_REPORT: 'clip.continuity.persist-report',
} as const;

export function buildClipContinuityWorkflowDefinition(
  clipCount: number,
): SystemWorkflowGraphDefinition {
  if (!Number.isInteger(clipCount) || clipCount < 0) {
    throw new Error('Clip continuity workflow requires a valid clip count');
  }
  const beginNode = createGenfeedActionNode({
    actionId: CLIP_CONTINUITY_ACTION_IDS.BEGIN,
    id: 'begin-continuity',
    inputVariableKeys: ['projectId'],
    position: { x: 0, y: 0 },
  });
  const qaNodes: WorkflowVisualNode[] = Array.from(
    { length: clipCount },
    (_, index) =>
      createGenfeedActionNode({
        actionId: 'videoQa',
        id: `continuity-qa-${index + 1}`,
        inputVariableKeys: [
          `video${index}`,
          'characterReferenceUrls',
          'productReferenceUrls',
        ],
        parameters: {
          blackDurationSeconds: 0.5,
          freezeDurationSeconds: 2,
          inputVideoKey: `video${index}`,
          isContactSheetEnabled: true,
          isContinuityQaEnabled: true,
        },
        position: { x: 0, y: (index + 1) * 160 },
      }),
  );
  const persistNode = createGenfeedActionNode({
    actionId: CLIP_CONTINUITY_ACTION_IDS.PERSIST_REPORT,
    id: 'persist-continuity-report',
    inputVariableKeys: [
      'projectId',
      'generationWorkflowExecutionId',
      'clipDescriptors',
      'referenceAssetIds',
    ],
    position: { x: 0, y: (clipCount + 2) * 160 },
  });
  const edges: WorkflowEdge[] = qaNodes.flatMap((node, index) => [
    {
      id: `begin-to-${node.id}`,
      source: beginNode.id,
      target: node.id,
      targetHandle: 'claim',
    },
    {
      id: `${node.id}-to-persist`,
      source: node.id,
      sourceHandle: 'continuityQa',
      target: persistNode.id,
      targetHandle: `qa${index}`,
    },
  ]);
  if (qaNodes.length === 0) {
    edges.push({
      id: 'begin-to-persist',
      source: beginNode.id,
      target: persistNode.id,
      targetHandle: 'claim',
    });
  }
  return {
    canonicalId: `clip-continuity:v1:${clipCount}`,
    definition: {
      edges,
      inputVariables: [
        {
          key: 'projectId',
          label: 'Clip project ID',
          required: true,
          type: 'text',
        },
        {
          key: 'generationWorkflowExecutionId',
          label: 'Generation execution ID',
          required: true,
          type: 'text',
        },
        {
          key: 'clipDescriptors',
          label: 'Clip result descriptors',
          required: true,
          type: 'json',
        },
        {
          key: 'referenceAssetIds',
          label: 'Canonical reference asset IDs',
          required: true,
          type: 'json',
        },
        {
          key: 'characterReferenceUrls',
          label: 'Character reference URLs',
          required: true,
          type: 'json',
        },
        {
          key: 'productReferenceUrls',
          label: 'Product reference URLs',
          required: true,
          type: 'json',
        },
        ...Array.from({ length: clipCount }, (_, index) => ({
          key: `video${index}`,
          label: `Clip ${index + 1} video`,
          required: true,
          type: 'video' as const,
        })),
      ],
      nodes: [beginNode, ...qaNodes, persistNode],
    },
    description:
      'Runs one canonical video QA action per completed clip and persists one aggregate continuity report.',
    label: 'Clip Continuity QA',
    resultNodeId: persistNode.id,
  };
}
