'use client';

import type { IIngredient, IMoodBoardLayoutItem } from '@genfeedai/interfaces';
import {
  mergeMoodBoardLayout,
  toMoodBoardLayout,
} from '@genfeedai/utils/moodboard/mood-board-layout.util';
import { applyNodeChanges, type NodeChange } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaAssetFlowNode } from '@/features/moodboard/moodboard.types';

/** Matches the workflow canvas autosave cadence. */
export const MOOD_BOARD_AUTOSAVE_DEBOUNCE_MS = 2000;

interface UseMoodBoardCanvasParams {
  assets: IIngredient[];
  savedLayout: IMoodBoardLayoutItem[];
  onPersist: (layout: IMoodBoardLayoutItem[]) => void;
}

interface UseMoodBoardCanvasResult {
  nodes: MediaAssetFlowNode[];
  onNodesChange: (changes: NodeChange<MediaAssetFlowNode>[]) => void;
  onNodeDragStop: () => void;
}

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

  useEffect(() => {
    const { seeds } = mergeMoodBoardLayout(assets, savedLayout);
    setNodes(
      seeds.map((seed) => ({
        id: seed.assetId,
        type: 'mediaAsset',
        position: seed.position,
        data: { ingredient: seed.ingredient },
      })),
    );
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
