import type { NodeType, WorkflowNode } from '@genfeedai/types';
import type { FitViewOptions } from '@xyflow/react';
import { useEffect } from 'react';
import { useWorkflowStore } from '../stores/workflowStore';
import type { NodeGroup } from '../types/groups';

interface UseCanvasKeyboardShortcutsParams {
  selectedNodeIds: string[];
  groups: NodeGroup[];
  nodes: WorkflowNode[];
  toggleNodeLock: (nodeId: string) => void;
  createGroup: (nodeIds: string[]) => string;
  deleteGroup: (groupId: string) => void;
  unlockAllNodes: () => void;
  addNode: (type: NodeType, position: { x: number; y: number }) => string;
  togglePalette: () => void;
  fitView: (options?: FitViewOptions) => void;
  openShortcutHelp: () => void;
  openNodeSearch: () => void;
  deleteSelectedElements: () => void;
}

/**
 * Hook that handles keyboard shortcuts for the workflow canvas
 *
 * Shortcuts:
 * - M: Toggle sidebar/palette
 * - L: Toggle lock on selected nodes
 * - F: Fit view to selection (or all if none selected)
 * - ?: Show shortcut help modal
 * - Ctrl/Cmd+F: Open node search
 * - Ctrl/Cmd+G: Create group from selection
 * - Ctrl/Cmd+Shift+G: Ungroup selected nodes
 * - Ctrl/Cmd+Shift+L: Unlock all nodes
 * - Shift+I: Add image generator node
 * - Shift+V: Add video generator node
 * - Shift+P: Add prompt node
 * - Shift+L: Add LLM node
 * - Ctrl/Cmd+Z: Undo
 * - Ctrl/Cmd+Shift+Z: Redo
 */
export function useCanvasKeyboardShortcuts({
  selectedNodeIds,
  groups,
  nodes,
  toggleNodeLock,
  createGroup,
  deleteGroup,
  unlockAllNodes,
  addNode,
  togglePalette,
  fitView,
  openShortcutHelp,
  openNodeSearch,
  deleteSelectedElements,
}: UseCanvasKeyboardShortcutsParams) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.contentEditable === 'true' ||
        (e.target as HTMLElement)?.closest?.(
          '[role="textbox"], [role="combobox"], [role="searchbox"]',
        )
      ) {
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;

      // Delete/Backspace - Delete selected elements
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedElements();
        return;
      }

      // M - Toggle sidebar (Todoist style)
      if (e.key === 'm' && !isMod && !e.shiftKey) {
        e.preventDefault();
        togglePalette();
      }

      // F - Fit view to selection (or all nodes if none selected)
      if (e.key === 'f' && !isMod && !e.shiftKey) {
        e.preventDefault();
        if (selectedNodeIds.length > 0) {
          // Fit to selected nodes
          const selectedNodes = nodes.filter((n) =>
            selectedNodeIds.includes(n.id),
          );
          fitView({ duration: 200, nodes: selectedNodes, padding: 0.3 });
        } else {
          // Fit to all nodes
          fitView({ duration: 200, padding: 0.2 });
        }
      }

      // ? - Show shortcut help modal
      if (e.key === '?' && e.shiftKey && !isMod) {
        e.preventDefault();
        openShortcutHelp();
      }

      // Ctrl/Cmd+F - Open node search
      if (e.key === 'f' && isMod && !e.shiftKey) {
        e.preventDefault();
        openNodeSearch();
      }

      // L - Toggle lock on selected nodes
      if (e.key === 'l' && !isMod && !e.shiftKey) {
        e.preventDefault();
        for (const nodeId of selectedNodeIds) {
          toggleNodeLock(nodeId);
        }
      }

      // Ctrl+G - Create group from selected nodes
      if (e.key === 'g' && isMod && !e.shiftKey) {
        e.preventDefault();
        if (selectedNodeIds.length > 1) {
          createGroup(selectedNodeIds);
        }
      }

      // Ctrl+Shift+G - Ungroup (delete group containing selected nodes)
      if (e.key === 'g' && isMod && e.shiftKey) {
        e.preventDefault();
        for (const nodeId of selectedNodeIds) {
          const group = groups.find((g) => g.nodeIds.includes(nodeId));
          if (group) {
            deleteGroup(group.id);
            break;
          }
        }
      }

      // Ctrl+Shift+L - Unlock all nodes
      if (e.key === 'l' && isMod && e.shiftKey) {
        e.preventDefault();
        unlockAllNodes();
      }

      // Shift+I - Add image generator node at viewport center
      if (e.key === 'I' && e.shiftKey && !isMod) {
        e.preventDefault();
        const position = {
          x: window.innerWidth / 2 - 150,
          y: window.innerHeight / 2 - 150,
        };
        addNode('imageGen', position);
      }

      // Shift+V - Add video generator node at viewport center
      if (e.key === 'V' && e.shiftKey && !isMod) {
        e.preventDefault();
        const position = {
          x: window.innerWidth / 2 - 150,
          y: window.innerHeight / 2 - 150,
        };
        addNode('videoGen', position);
      }

      // Shift+P - Add prompt node at viewport center
      if (e.key === 'P' && e.shiftKey && !isMod) {
        e.preventDefault();
        const position = {
          x: window.innerWidth / 2 - 150,
          y: window.innerHeight / 2 - 150,
        };
        addNode('prompt', position);
      }

      // Shift+L - Add LLM node at viewport center
      if ((e.key === 'L' || e.key === 'l') && e.shiftKey && !isMod) {
        e.preventDefault();
        const position = {
          x: window.innerWidth / 2 - 150,
          y: window.innerHeight / 2 - 150,
        };
        addNode('llm', position);
      }

      // Cmd/Ctrl+Z - Undo
      if (e.key === 'z' && isMod && !e.shiftKey) {
        e.preventDefault();
        useWorkflowStore.temporal.getState().undo();
      }

      // Cmd/Ctrl+Shift+Z - Redo
      if (e.key === 'z' && isMod && e.shiftKey) {
        e.preventDefault();
        useWorkflowStore.temporal.getState().redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedNodeIds,
    toggleNodeLock,
    createGroup,
    deleteGroup,
    unlockAllNodes,
    groups,
    nodes,
    addNode,
    togglePalette,
    fitView,
    openShortcutHelp,
    openNodeSearch,
    deleteSelectedElements,
  ]);
}
