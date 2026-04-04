import { nodeTypes as coreNodeTypes } from '@genfeedai/workflow-ui/nodes';
import { extendedNodeTypes } from '@workflow-cloud/nodes';
import { CloudImageInputNode } from '@workflow-cloud/nodes/input/CloudImageInputNode';
import { CloudVideoInputNode } from '@workflow-cloud/nodes/input/CloudVideoInputNode';
import { saasNodeTypes } from '@workflow-cloud/nodes/saas';
import { TemplateCompatibilityNode } from '@workflow-cloud/nodes/TemplateCompatibilityNode';
import { UnknownWorkflowNode } from '@workflow-cloud/nodes/UnknownWorkflowNode';
import type { NodeTypes } from '@xyflow/react';

/**
 * Merged node types for Genfeed Cloud workflow canvas
 *
 * Combines:
 * - 29 core OSS nodes (input, AI, processing, output, composition)
 * - 7 premium extended nodes (effects, distribution, automation, repurposing)
 * - 7 SaaS nodes (brand management, AI persona content, publishing)
 */
const fallbackNodeType = UnknownWorkflowNode;

export const cloudNodeTypes: NodeTypes = Object.fromEntries(
  Object.entries({
    ...coreNodeTypes, // 29 core nodes
    'ai-avatar-video': TemplateCompatibilityNode,
    'effect-captions': TemplateCompatibilityNode,
    'input-image': CloudImageInputNode,
    'input-video': CloudVideoInputNode,
    musicSource: TemplateCompatibilityNode,
    soundOverlay: TemplateCompatibilityNode,
    ...extendedNodeTypes, // 7 premium nodes
    ...saasNodeTypes, // 7 SaaS nodes
    unknown: fallbackNodeType,
  }).map(([nodeType, component]) => [nodeType, component ?? fallbackNodeType]),
) as NodeTypes;
