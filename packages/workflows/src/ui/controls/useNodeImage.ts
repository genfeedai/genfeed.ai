'use client';

import { useWorkflowStore } from '../stores/workflow';

/** The image a node works on: the one connected to its image input, else the one saved on the node. */
export function useNodeImage(nodeId: string): string | null {
  const getConnectedInputs = useWorkflowStore(
    (state) => state.getConnectedInputs,
  );
  const savedImage = useWorkflowStore((state) => {
    const node = state.nodes.find((candidate) => candidate.id === nodeId);
    return (node?.data as { inputImage?: unknown } | undefined)?.inputImage;
  });
  const connected = getConnectedInputs(nodeId).get('image');
  if (typeof connected === 'string' && connected) {
    return connected;
  }
  return typeof savedImage === 'string' && savedImage ? savedImage : null;
}
