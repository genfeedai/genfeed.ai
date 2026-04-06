import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';
import { useExecutionStore } from '@/store/executionStore';
import { useRunWorkflowConfirmationStore } from '@/store/runWorkflowConfirmationStore';
import { selectSelectedNodeIds } from '@/store/workflow/selectors';
import { useWorkflowStore } from '@/store/workflowStore';

/**
 * Global keyboard shortcuts hook
 * Handles ⌘+K (command palette), ⌘+Enter (run), ⌘+, (settings), etc.
 */
export function useGlobalShortcuts() {
  const router = useRouter();
  const { href } = useOrgUrl();
  const { toggle: toggleCommandPalette, isOpen: isCommandPaletteOpen } =
    useCommandPaletteStore();
  const executeWorkflow = useExecutionStore((state) => state.executeWorkflow);
  const executeSelectedNodes = useExecutionStore(
    (state) => state.executeSelectedNodes,
  );
  const requestConfirmation = useRunWorkflowConfirmationStore(
    (state) => state.requestConfirmation,
  );
  const isRunning = useExecutionStore((state) => state.isRunning);
  const { openModal } = useUIStore();
  const selectedNodeIds = useWorkflowStore(selectSelectedNodeIds);
  const exportWorkflow = useWorkflowStore((state) => state.exportWorkflow);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input (unless it's the command palette input)
      const target = e.target;
      const isElement = target instanceof Element;
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement;
      const isCommandPaletteInput = isElement
        ? target.closest('[data-command-palette]')
        : null;

      // Allow Escape to close command palette even in inputs
      if (e.key === 'Escape' && isCommandPaletteOpen) {
        return; // Let the CommandPalette handle this
      }

      // Block most shortcuts when typing in regular inputs
      if (isInput && !isCommandPaletteInput) {
        // Still allow ⌘+K and ⌘+Enter in inputs
        const isMod = e.ctrlKey || e.metaKey;
        if (!(isMod && (e.key === 'k' || e.key === 'K' || e.key === 'Enter'))) {
          return;
        }
      }

      const isMod = e.ctrlKey || e.metaKey;

      // ⌘+K - Toggle command palette
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }

      // Don't process other shortcuts if command palette is open
      if (isCommandPaletteOpen) return;

      // ⌘+Enter - Run workflow
      if (isMod && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isRunning) {
          requestConfirmation(() => executeWorkflow());
        }
        return;
      }

      // ⌘+Shift+Enter - Run selected nodes
      if (isMod && e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        if (!isRunning && selectedNodeIds.length > 0) {
          executeSelectedNodes();
        }
        return;
      }

      // ⌘+, - Open settings
      if (isMod && e.key === ',') {
        e.preventDefault();
        openModal('settings');
        return;
      }

      // ⌘+S - Save/export workflow
      if (isMod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        const workflow = exportWorkflow();
        const blob = new Blob([JSON.stringify(workflow, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${workflow.name.toLowerCase().replace(/\s+/g, '-')}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      // ⌘+N - New workflow
      if (isMod && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        router.push(href('/workflows/new'));
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    toggleCommandPalette,
    isCommandPaletteOpen,
    executeWorkflow,
    requestConfirmation,
    executeSelectedNodes,
    isRunning,
    selectedNodeIds.length,
    openModal,
    exportWorkflow,
    router,
    href,
  ]);
}
