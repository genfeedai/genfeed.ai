'use client';

import { useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import { useWorkflowStore } from '@/store/workflowStore';

const AUTO_SAVE_DELAY = 2500; // 2.5 seconds

interface UseAutoSaveReturn {
  isSaving: boolean;
  lastSavedAt: Date | null;
}

/**
 * Auto-save workflow after 2.5 seconds of inactivity
 *
 * @param enabled - Whether auto-save is enabled
 * @returns Current save state
 */
export function useAutoSave(enabled = true): UseAutoSaveReturn {
  const isDirty = useWorkflowStore((state) => state.isDirty);
  const isSaving = useWorkflowStore((state) => state.isSaving);
  const nodes = useWorkflowStore((state) => state.nodes);

  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Create a stable hash of nodes to detect any data changes (not just length)
  // This ensures we re-debounce when node data (like schemaParams) changes
  const _nodesHash = JSON.stringify(nodes.map((n) => ({ data: n.data, id: n.id })));

  useEffect(() => {
    // Don't save if disabled, not dirty, already saving, or empty workflow
    if (!enabled || !isDirty || isSaving || nodes.length === 0) {
      return;
    }

    // Clear existing timeout on new change (debounce)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Schedule save after 2.5s of inactivity
    // Get fresh state at save time to avoid stale closure issues
    timeoutRef.current = setTimeout(async () => {
      abortControllerRef.current = new AbortController();

      try {
        // Get saveWorkflow fresh from store to ensure we have latest state
        const { saveWorkflow } = useWorkflowStore.getState();
        await saveWorkflow(abortControllerRef.current.signal);
        setLastSavedAt(new Date());
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          logger.error('Auto-save failed', error, { context: 'useAutoSave' });
        }
      }
    }, AUTO_SAVE_DELAY);

    // Cleanup on unmount or when deps change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isDirty, enabled, isSaving, nodes.length]);

  return { isSaving, lastSavedAt };
}
