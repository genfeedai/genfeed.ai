import { createGenfeedActionNode } from '@genfeedai/actions';
import type {
  WorkflowEdge,
  WorkflowVisualNode,
} from '@server/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowGraphDefinition } from '@server/collections/workflows/system-workflow-runner.service';
import { buildWorkflowVersionDefinition } from '@server/collections/workflows/workflow-version-definition';
import type { ClipGenerationInput } from './clip-generation.service';

export const CLIP_HOOK_REVIEW_NODE_ID = 'review-hook';

function generationNode(
  originalIndex: number,
  positionIndex: number,
): WorkflowVisualNode {
  return createGenfeedActionNode({
    actionId: 'clip.generation.generate-one',
    id: `generate-clip-${originalIndex + 1}`,
    inputVariableKeys: ['request'],
    parameters: { originalIndex },
    position: { x: 0, y: positionIndex * 160 },
  });
}

export function buildClipGenerationWorkflowDefinition(
  input: ClipGenerationInput,
): SystemWorkflowGraphDefinition {
  if (input.highlights.length === 0) {
    throw new Error('Clip generation workflow requires at least one highlight');
  }

  const hookReviewRequired =
    (input.hookApprovalRequired ??
      ((input.mode ?? 'avatar') === 'avatar' && input.highlights.length > 1)) &&
    input.highlights.length > 1;
  const hookIndex = hookReviewRequired
    ? Math.max(
        input.highlights.findIndex(
          (highlight) => highlight.clip_type.toLowerCase() === 'hook',
        ),
        0,
      )
    : -1;
  const orderedHighlights = hookReviewRequired
    ? [
        { highlight: input.highlights[hookIndex], originalIndex: hookIndex },
        ...input.highlights.flatMap((highlight, originalIndex) =>
          originalIndex === hookIndex ? [] : [{ highlight, originalIndex }],
        ),
      ]
    : input.highlights.map((highlight, originalIndex) => ({
        highlight,
        originalIndex,
      }));
  const nodes: WorkflowVisualNode[] = [];
  const edges: WorkflowEdge[] = [];

  orderedHighlights.forEach(({ highlight, originalIndex }, positionIndex) => {
    if (!highlight) {
      throw new Error('Clip generation workflow could not resolve its hook');
    }
    nodes.push(generationNode(originalIndex, positionIndex));
  });

  if (hookReviewRequired) {
    nodes.splice(1, 0, {
      data: {
        config: {
          autoApproveIfNoResponse: false,
          timeoutHours: 24,
        },
        label: 'Review Hook Clip',
      },
      id: CLIP_HOOK_REVIEW_NODE_ID,
      position: { x: 0, y: 160 },
      type: 'reviewGate',
    });
    const hookNodeId = `generate-clip-${hookIndex + 1}`;
    edges.push({
      id: `${hookNodeId}-to-review`,
      source: hookNodeId,
      target: CLIP_HOOK_REVIEW_NODE_ID,
      targetHandle: 'media',
    });
    orderedHighlights.slice(1).forEach(({ originalIndex }) => {
      edges.push({
        id: `review-to-generate-clip-${originalIndex + 1}`,
        source: CLIP_HOOK_REVIEW_NODE_ID,
        target: `generate-clip-${originalIndex + 1}`,
        targetHandle: 'approval',
      });
    });
  }

  const resultNodeId = 'collect-clip-results';
  nodes.push(
    createGenfeedActionNode({
      actionId: 'clip.generation.collect-results',
      id: resultNodeId,
      position: { x: 0, y: (nodes.length + 1) * 160 },
    }),
  );
  orderedHighlights.forEach(({ originalIndex }) => {
    const nodeId = `generate-clip-${originalIndex + 1}`;
    edges.push({
      id: `${nodeId}-to-results`,
      source: nodeId,
      target: resultNodeId,
      targetHandle: `clip${originalIndex}`,
    });
  });

  const definition = {
    edges,
    inputVariables: [
      {
        key: 'request',
        label: 'Clip generation request',
        required: true,
        type: 'json' as const,
      },
    ],
    nodes,
  };
  const contentHash = buildWorkflowVersionDefinition(definition).contentHash;
  return {
    canonicalId: `clip-generation:${input.projectId}:${contentHash.replace('sha256:v1:', '')}`,
    definition,
    description:
      'Generates one action node per clip and pauses at the shared review gate when hook approval is required.',
    label: 'Clip Generation',
    resultNodeId,
  };
}
