import type { BaseNodeData as CoreBaseNodeData } from '@genfeedai/types/nodes';
import * as CoreNodeTypes from '@genfeedai/types/nodes';

export type {
  HandleDefinition,
  HandleType,
  NodeCategory,
  NodeDefinition,
  NodeStatus,
  NodeType,
} from '@genfeedai/types/nodes';

export const NodeStatusEnum = CoreNodeTypes.NodeStatusEnum;
export const HandleTypeEnum = CoreNodeTypes.HandleTypeEnum;

export type { NodeType as CoreNodeType } from '@genfeedai/types/nodes';

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

// Shared handle and category types — canonical copy lives in workflow-engine shim;
// inlined here to avoid a cross-package dependency.
export type SaaSHandleType =
  | 'image'
  | 'text'
  | 'video'
  | 'number'
  | 'audio'
  | 'brand'
  | 'object'
  | 'any';

export interface SaaSHandleDefinition {
  id: string;
  type: SaaSHandleType;
  label: string;
  required?: boolean;
  multiple?: boolean;
}

export type ExtendedNodeCategory =
  | 'input'
  | 'ai'
  | 'processing'
  | 'output'
  | 'distribution'
  | 'composition'
  | 'automation'
  | 'repurposing'
  | 'saas';

export interface WorkflowNodeData extends BaseNodeData {
  error?: string;
}
