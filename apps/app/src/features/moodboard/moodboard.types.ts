import type { IIngredient, IMoodBoardLayoutItem } from '@genfeedai/interfaces';
import type { Node, NodeChange, NodeProps } from '@xyflow/react';
import type { ReactNode } from 'react';

export interface MediaAssetNodeData extends Record<string, unknown> {
  ingredient: IIngredient;
}

export type MediaAssetFlowNode = Node<MediaAssetNodeData, 'mediaAsset'>;

export type MediaAssetNodeProps = NodeProps<MediaAssetFlowNode>;

export interface MoodBoardCanvasProps {
  assets: IIngredient[];
  nodes: MediaAssetFlowNode[];
  onNodesChange: (changes: NodeChange<MediaAssetFlowNode>[]) => void;
  onNodeDragStop: () => void;
  onClose: () => void;
  isTruncated?: boolean;
}

export interface UseMoodBoardCanvasParams {
  assets: IIngredient[];
  savedLayout: IMoodBoardLayoutItem[];
  onPersist: (layout: IMoodBoardLayoutItem[]) => void;
}

export interface UseMoodBoardCanvasResult {
  nodes: MediaAssetFlowNode[];
  onNodesChange: (changes: NodeChange<MediaAssetFlowNode>[]) => void;
  onNodeDragStop: () => void;
}

export interface CanvasMessageProps {
  title: string;
  children?: ReactNode;
}
