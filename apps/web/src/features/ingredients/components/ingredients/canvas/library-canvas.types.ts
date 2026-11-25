import type {
  IIngredient,
  IMoodBoardLayoutItem,
} from '@genfeedai/contracts/interfaces';
import type { Node, NodeChangeset, NodeProps } from '@xyflow/react';

/**
 * React Flow types are generic over the node payload, so these shapes stay
 * beside the canvas rather than in `@genfeedai/props` — which carries no
 * `@xyflow/react` dependency. The canvas's own public props live there.
 */
interface LibraryCanvasNodeData extends Record<string, unknown> {
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
  onNodesChange: (changes: NodeChangeset<LibraryCanvasFlowNode>) => void;
  onNodeDragStop: () => void;
}
