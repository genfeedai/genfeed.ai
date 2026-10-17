import type { DragEvent } from 'react';
import { useCallback, useState } from 'react';
import { moveRailAppBefore } from './app-rail.order';

interface UseRailDragReorderOptions {
  ids: readonly string[];
  isEnabled: boolean;
  onReorder: (ids: readonly string[]) => void;
}

interface RailDragItemProps {
  draggable?: true;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent) => void;
  onDragStart?: (event: DragEvent) => void;
  onDrop?: (event: DragEvent) => void;
}

/**
 * Slack-style drag to reorder: each rail slot is a drag source and a drop
 * target, and dropping an item on a slot puts it in that slot.
 */
export function useRailDragReorder({
  ids,
  isEnabled,
  onReorder,
}: UseRailDragReorderOptions) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const reset = useCallback(() => {
    setDraggingId(null);
    setOverId(null);
  }, []);

  const getItemProps = useCallback(
    (id: string): RailDragItemProps => {
      if (!isEnabled) return {};
      return {
        draggable: true,
        onDragEnd: reset,
        onDragOver: (event) => {
          if (!draggingId) return;
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
          if (overId !== id) setOverId(id);
        },
        onDragStart: (event) => {
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', id);
          }
          setDraggingId(id);
        },
        onDrop: (event) => {
          event.preventDefault();
          if (draggingId) {
            const next = moveRailAppBefore(ids, draggingId, id);
            if (next !== ids) onReorder(next);
          }
          reset();
        },
      };
    },
    [draggingId, ids, isEnabled, onReorder, overId, reset],
  );

  return { draggingId, getItemProps, overId };
}
