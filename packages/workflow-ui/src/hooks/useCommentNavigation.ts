import { useCallback, useMemo } from 'react';
import { useWorkflowStore } from '../stores/workflowStore';

export interface CommentNavigation {
  currentIndex: number;
  totalCount: number;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * Hook that provides navigation props for nodes with comments.
 * Returns null if the node has no comment.
 */
export function useCommentNavigation(nodeId: string): CommentNavigation | null {
  const nodes = useWorkflowStore((state) => state.nodes);
  const getNodesWithComments = useWorkflowStore(
    (state) => state.getNodesWithComments,
  );
  const markCommentViewed = useWorkflowStore(
    (state) => state.markCommentViewed,
  );
  const setNavigationTarget = useWorkflowStore(
    (state) => state.setNavigationTarget,
  );

  const nodeComment = useMemo(() => {
    const node = nodes.find((n) => n.id === nodeId);
    const data = node?.data as { comment?: string } | undefined;
    return data?.comment?.trim() || null;
  }, [nodes, nodeId]);

  const nodesWithComments = useMemo(() => {
    return getNodesWithComments();
  }, [getNodesWithComments]);

  const currentIndex = useMemo(() => {
    return nodesWithComments.findIndex((n) => n.id === nodeId);
  }, [nodesWithComments, nodeId]);

  const navigateTo = useCallback(
    (targetIndex: number) => {
      const targetNode = nodesWithComments[targetIndex];
      if (targetNode) {
        markCommentViewed(targetNode.id);
        setNavigationTarget(targetNode.id);
      }
    },
    [nodesWithComments, markCommentViewed, setNavigationTarget],
  );

  const onPrevious = useCallback(() => {
    if (nodesWithComments.length === 0) return;
    const newIndex =
      currentIndex <= 0 ? nodesWithComments.length - 1 : currentIndex - 1;
    navigateTo(newIndex);
  }, [currentIndex, nodesWithComments.length, navigateTo]);

  const onNext = useCallback(() => {
    if (nodesWithComments.length === 0) return;
    const newIndex = (currentIndex + 1) % nodesWithComments.length;
    navigateTo(newIndex);
  }, [currentIndex, nodesWithComments.length, navigateTo]);

  if (!nodeComment || currentIndex === -1) {
    return null;
  }

  return {
    currentIndex: currentIndex + 1, // 1-based for display
    onNext,
    onPrevious,
    totalCount: nodesWithComments.length,
  };
}
