import type { BaseNodeData as CoreBaseNodeData } from '@cloud/types/nodes';
import * as CoreNodeTypes from '@cloud/types/nodes';

export type {
  HandleDefinition,
  HandleType,
  NodeCategory,
  NodeDefinition,
  NodeStatus,
  NodeType,
} from '@cloud/types/nodes';

export const NodeStatusEnum = CoreNodeTypes.NodeStatusEnum;
export const HandleTypeEnum = CoreNodeTypes.HandleTypeEnum;

export type { NodeType as CoreNodeType } from '@cloud/types/nodes';

export interface BaseNodeData extends CoreBaseNodeData {
  label: CoreBaseNodeData['label'];
  status: CoreBaseNodeData['status'];
  error?: CoreBaseNodeData['error'];
  progress?: CoreBaseNodeData['progress'];
  isLocked?: CoreBaseNodeData['isLocked'];
  cachedOutput?: CoreBaseNodeData['cachedOutput'];
  lockTimestamp?: CoreBaseNodeData['lockTimestamp'];
  comment?: CoreBaseNodeData['comment'];
  color?: CoreBaseNodeData['color'];
}

// Use public core contracts so private SaaS nodes extend the same shared model.
export type {
  ExtendedNodeCategory,
  SaaSHandleDefinition,
  SaaSHandleType,
} from './workflows-contracts-shim';

export interface WorkflowNodeData extends BaseNodeData {
  error?: string;
}
