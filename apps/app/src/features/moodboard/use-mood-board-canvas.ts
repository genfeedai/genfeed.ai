'use client';

import {
  mergeMoodBoardLayout,
  toMoodBoardLayout,
} from '@genfeedai/utils/moodboard/mood-board-layout.util';
import { applyNodeChanges, type NodeChange } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MediaAssetFlowNode,
  UseMoodBoardCanvasParams,
  UseMoodBoardCanvasResult,
} from '@/features/moodboard/moodboard.types';

/** Matches the workflow canvas autosave cadence. */
export const MOOD_BOARD_AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * Owns the React Flow node state for the mood board: hydrates nodes from live
 * assets merged with the saved layout, applies drag changes, and persists the
 * arrangement (debounced) whenever a drag completes. Mirrors the workflow
 * canvas's dirty-then-debounce autosave, minus the execution machinery.
 */
export function useMoodBoardCanvas({
  assets,
  savedLayout,
  onPersist,
}: UseMoodBoardCanvasParams): UseMoodBoardCanvasResult {
  const [nodes, setNodes] = useState<MediaAssetFlowNode[]>([]);

  const nodesRef = useRef<MediaAssetFlowNode[]>([]);
  nodesRef.current = nodes;

  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const knownIds = useMemo(
    () => new Set(assets.map((asset) => asset.id)),
    [assets],
  );

  const hydratedLayoutRef = useRef<typeof savedLayout | undefined>(undefined);

  useEffect(() => {
    const { seeds } = mergeMoodBoardLayout(assets, savedLayout);
    // The saved layout usually arrives after the first assets do, so those
    // tiles were seeded into grid slots. Applying the layout is the whole
    // point of it loading — preserving live positions here would pin the
    // placeholder grid and then persist it on the next drag.
    const hasNewLayout = hydratedLayoutRef.current !== savedLayout;
    hydratedLayoutRef.current = savedLayout;

    setNodes((current) => {
      // Assets stream in page by page, so this re-derives mid-session. On an
      // asset-only update a tile the user has dragged but not yet autosaved
      // keeps its live position instead of snapping back to its grid slot.
      const livePositions = hasNewLayout
        ? new Map<string, (typeof current)[number]['position']>()
        : new Map(current.map((node) => [node.id, node.position]));

      return seeds.map((seed) => ({
        id: seed.assetId,
        type: 'mediaAsset',
        position: livePositions.get(seed.assetId) ?? seed.position,
        data: { ingredient: seed.ingredient },
      }));
    });
  }, [assets, savedLayout]);

  const onNodesChange = useCallback(
    (changes: NodeChange<MediaAssetFlowNode>[]) => {
      setNodes((current) => applyNodeChanges(changes, current));
    },
    [],
  );

  const onNodeDragStop = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      onPersistRef.current(toMoodBoardLayout(nodesRef.current, knownIds));
    }, MOOD_BOARD_AUTOSAVE_DEBOUNCE_MS);
  }, [knownIds]);

  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    },
    [],
  );

  return { nodes, onNodeDragStop, onNodesChange };
}
