import type { IIngredient } from '@genfeedai/interfaces';
import type { Node, NodeProps } from '@xyflow/react';

export interface MediaAssetNodeData extends Record<string, unknown> {
  ingredient: IIngredient;
}

export type MediaAssetFlowNode = Node<MediaAssetNodeData, 'mediaAsset'>;

export type MediaAssetNodeProps = NodeProps<MediaAssetFlowNode>;
