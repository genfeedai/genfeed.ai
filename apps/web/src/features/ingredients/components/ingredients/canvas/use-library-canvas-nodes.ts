'use client';

import {
  mergeMoodBoardLayout,
  toMoodBoardLayout,
} from '@genfeedai/utils/moodboard/mood-board-layout.util';
import { applyNodeChanges, type NodeChange } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  LibraryCanvasFlowNode,
  UseLibraryCanvasNodesParams,
  UseLibraryCanvasNodesResult,
} from './library-canvas.types';

/** Matches the workflow canvas autosave cadence. */
export const LIBRARY_CANVAS_AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * Owns the React Flow node state for the Library canvas view: hydrates nodes
 * from the ingredients currently in view merged with the saved board layout,
 * applies drag changes, and persists the arrangement (debounced) whenever a
 * drag completes. Mirrors the workflow canvas's dirty-then-debounce autosave,
 * minus the execution machinery.
 */
export function useLibraryCanvasNodes({
  ingredients,
  savedLayout,
  onPersist,
}: UseLibraryCanvasNodesParams): UseLibraryCanvasNodesResult {
  const [nodes, setNodes] = useState<LibraryCanvasFlowNode[]>([]);

  const nodesRef = useRef<LibraryCanvasFlowNode[]>([]);
  nodesRef.current = nodes;

  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const knownIds = useMemo(
    () => new Set(ingredients.map((ingredient) => ingredient.id)),
    [ingredients],
  );

  const hydratedLayoutRef = useRef<typeof savedLayout | undefined>(undefined);

  useEffect(() => {
    const { seeds } = mergeMoodBoardLayout(ingredients, savedLayout);
    // The saved layout usually arrives after the first assets do, so those
    // tiles were seeded into grid slots. Applying the layout is the whole
    // point of it loading — preserving live positions here would pin the
    // placeholder grid and then persist it on the next drag.
    const hasNewLayout = hydratedLayoutRef.current !== savedLayout;
    hydratedLayoutRef.current = savedLayout;

    setNodes((current) => {
      // Assets stream in page by page, and filters re-derive the list mid
      // session. On an asset-only update a tile the user has dragged but not
      // yet autosaved keeps its live position instead of snapping back to its
      // grid slot.
      const livePositions = hasNewLayout
        ? new Map<string, (typeof current)[number]['position']>()
        : new Map(current.map((node) => [node.id, node.position]));

      return seeds.map((seed) => ({
        data: { ingredient: seed.ingredient },
        id: seed.assetId,
        position: livePositions.get(seed.assetId) ?? seed.position,
        type: 'libraryAsset' as const,
      }));
    });
  }, [ingredients, savedLayout]);

  const onNodesChange = useCallback(
    (changes: NodeChange<LibraryCanvasFlowNode>[]) => {
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
    }, LIBRARY_CANVAS_AUTOSAVE_DEBOUNCE_MS);
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
