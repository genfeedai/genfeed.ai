import type { UseDeskKeyboardOptions } from '@props/trends/discovery-desk.props';
import { useEffect } from 'react';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable;
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

/**
 * Desk keyboard shortcuts: J/K move the focused row, X toggles selection on
 * the focused row, R remixes the focused item, Escape clears the selection.
 * Ignored while typing in a form control or when a modifier key is held.
 */
export function useDeskKeyboard({
  cursorKey,
  onClearSelection,
  onMoveCursor,
  onRemix,
  onToggleSelect,
  selectedItem,
}: UseDeskKeyboardOptions): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (hasModifier(event) || isEditableTarget(event.target)) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'j':
          event.preventDefault();
          onMoveCursor(1);
          break;
        case 'k':
          event.preventDefault();
          onMoveCursor(-1);
          break;
        case 'x':
          if (cursorKey) {
            event.preventDefault();
            onToggleSelect(cursorKey);
          }
          break;
        case 'r':
          if (selectedItem) {
            event.preventDefault();
            onRemix(selectedItem);
          }
          break;
        case 'escape':
          event.preventDefault();
          onClearSelection();
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    cursorKey,
    onClearSelection,
    onMoveCursor,
    onRemix,
    onToggleSelect,
    selectedItem,
  ]);
}
