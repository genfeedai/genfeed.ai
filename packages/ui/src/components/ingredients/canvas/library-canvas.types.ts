import type { IIngredient, IMoodBoardLayoutItem } from '@genfeedai/interfaces';
import type { Node, NodeChange, NodeProps } from '@xyflow/react';

/**
 * React Flow types are generic over the node payload, so these shapes stay
 * beside the canvas rather than in `@genfeedai/props` — which carries no
 * `@xyflow/react` dependency. The canvas's own public props live there.
 */
export interface LibraryCanvasNodeData extends Record<string, unknown> {
  ingredient: IIngredient;
}

export type LibraryCanvasFlowNode = Node<LibraryCanvasNodeData, 'libraryAsset'>;

export type LibraryCanvasNodeProps = NodeProps<LibraryCanvasFlowNode>;

export interface UseLibraryCanvasNodesParams {
  ingredients: IIngredient[];
  savedLayout: IMoodBoardLayoutItem[];
  onPersist: (layout: IMoodBoardLayoutItem[]) => void;
}

export interface UseLibraryCanvasNodesResult {
  nodes: LibraryCanvasFlowNode[];
  onNodesChange: (changes: NodeChange<LibraryCanvasFlowNode>[]) => void;
  onNodeDragStop: () => void;
}
