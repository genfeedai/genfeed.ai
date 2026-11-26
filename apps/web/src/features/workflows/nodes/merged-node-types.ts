import { nodeTypes as coreNodeTypes } from '@genfeedai/workflows/ui/nodes';
import type { NodeTypes } from '@xyflow/react';
import { ReviewGateNode } from '@/features/workflows/nodes/automation/ReviewGateNode';
import { CloudGenfeedActionNode } from '@/features/workflows/nodes/CloudGenfeedActionNode';
import { CloudImageInputNode } from '@/features/workflows/nodes/input/CloudImageInputNode';
import { CloudVideoInputNode } from '@/features/workflows/nodes/input/CloudVideoInputNode';
import { RegisteredWorkflowNode } from '@/features/workflows/nodes/RegisteredWorkflowNode';
import { UnknownWorkflowNode } from '@/features/workflows/nodes/UnknownWorkflowNode';

/**
 * Merged node types for Genfeed Cloud workflow canvas
 *
 * Product behavior always renders through `genfeedAction`. Only workflow-engine
 * primitives retain their own React Flow node type, and so do the annotation and
 * motion-control nodes, which carry geometry that has its own editor.
 */
const fallbackNodeType = UnknownWorkflowNode;

export const cloudNodeTypes: NodeTypes = Object.fromEntries(
  Object.entries({
    genfeedAction: CloudGenfeedActionNode,
    annotation: coreNodeTypes.annotation,
    commentTrigger: RegisteredWorkflowNode,
    engagementTrigger: RegisteredWorkflowNode,
    'input-image': CloudImageInputNode,
    'input-video': CloudVideoInputNode,
    keywordTrigger: RegisteredWorkflowNode,
    motionControl: coreNodeTypes.motionControl,
    reviewGate: ReviewGateNode,
    workflowInput: coreNodeTypes.workflowInput,
    unknown: fallbackNodeType,
  }).map(([nodeType, component]) => [nodeType, component ?? fallbackNodeType]),
) as NodeTypes;
