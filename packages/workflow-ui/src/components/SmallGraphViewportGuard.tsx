'use client';

import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { useWorkflowStore } from '../stores/workflowStore';

const SMALL_GRAPH_NODE_LIMIT = 2;
const SMALL_GRAPH_MAX_ZOOM = 0.9;
const SMALL_GRAPH_MIN_ZOOM = 0.35;
const SMALL_GRAPH_PADDING = 0.24;

export function SmallGraphViewportGuard() {
  const nodes = useWorkflowStore((state) => state.nodes);
  const reactFlow = useReactFlow();
  const previousNodeCountRef = useRef<number | null>(null);

  useEffect(() => {
    const previousNodeCount = previousNodeCountRef.current;
    previousNodeCountRef.current = nodes.length;

    if (previousNodeCount === null) {
      return;
    }

    const isSmallGraph =
      nodes.length > 0 && nodes.length <= SMALL_GRAPH_NODE_LIMIT;
    const addedNodeToSmallGraph = nodes.length > previousNodeCount;

    if (!isSmallGraph || !addedNodeToSmallGraph) {
      return;
    }

    const schedule =
      typeof window !== 'undefined' && window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : (callback: FrameRequestCallback) =>
            window.setTimeout(() => callback(performance.now()), 0);
    const cancel =
      typeof window !== 'undefined' && window.cancelAnimationFrame
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout.bind(window);

    const handle = schedule(() => {
      reactFlow.fitView({
        duration: 180,
        maxZoom: SMALL_GRAPH_MAX_ZOOM,
        minZoom: SMALL_GRAPH_MIN_ZOOM,
        padding: SMALL_GRAPH_PADDING,
      });
    });

    return () => {
      cancel(handle);
    };
  }, [nodes.length, reactFlow]);

  return null;
}
