'use client';

import type { WorkflowFile } from '@genfeedai/types';
import {
  AlertCircle,
  Bug,
  FolderOpen,
  HelpCircle,
  LayoutGrid,
  Redo2,
  Save,
  SaveAll,
  Settings,
  Undo2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useExecutionStore } from '../stores/executionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflowStore';
import { Button } from '../ui/button';
import { SaveAsDialog } from './SaveAsDialog';
import { SaveIndicator } from './SaveIndicator';
import { ToolbarDropdown } from './ToolbarDropdown';
import type { DropdownItem, ToolbarProps } from './types';

/**
 * Validates workflow JSON structure before loading
 */
function isValidWorkflow(data: unknown): data is WorkflowFile {
  if (!data || typeof data !== 'object') return false;

  const workflow = data as Record<string, unknown>;

  if (typeof workflow.name !== 'string') return false;
  if (!Array.isArray(workflow.nodes)) return false;
  if (!Array.isArray(workflow.edges)) return false;

  for (const node of workflow.nodes) {
    if (!node || typeof node !== 'object') return false;
    const n = node as Record<string, unknown>;
    if (typeof n.id !== 'string') return false;
    if (typeof n.type !== 'string') return false;
    if (!n.position || typeof n.position !== 'object') return false;
  }

  for (const edge of workflow.edges) {
    if (!edge || typeof edge !== 'object') return false;
    const e = edge as Record<string, unknown>;
    if (typeof e.id !== 'string') return false;
    if (typeof e.source !== 'string') return false;
    if (typeof e.target !== 'string') return false;
  }

  return true;
}

export function Toolbar({
  onAutoLayout,
  onSaveAs,
  fileMenuItemsPrepend,
  fileMenuItemsAppend,
  additionalMenus,
  branding,
  leftContent,
  middleContent,
  saveIndicator,
  logoHref = '/',
  logoSrc = 'https://cdn.genfeed.ai/assets/branding/logo-white.png',
  showSettings = true,
  showShortcutHelp = false,
  rightContent,
}: ToolbarProps) {
  const { exportWorkflow, workflowName } = useWorkflowStore();
  const { undo, redo } = useWorkflowStore.temporal.getState();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const validationErrors = useExecutionStore((state) => state.validationErrors);
  const clearValidationErrors = useExecutionStore(
    (state) => state.clearValidationErrors,
  );
  const { openModal } = useUIStore();
  const debugMode = useSettingsStore((s) => s.debugMode);

  const uniqueErrorMessages = useMemo(() => {
    if (!validationErrors?.errors.length) return [];
    return [...new Set(validationErrors.errors.map((e) => e.message))];
  }, [validationErrors]);

  // Subscribe to temporal state changes for undo/redo button states
  useEffect(() => {
    const unsubscribe = useWorkflowStore.temporal.subscribe((state) => {
      setCanUndo(state.pastStates.length > 0);
      setCanRedo(state.futureStates.length > 0);
    });
    // Initialize state
    const temporal = useWorkflowStore.temporal.getState();
    setCanUndo(temporal.pastStates.length > 0);
    setCanRedo(temporal.futureStates.length > 0);
    return unsubscribe;
  }, []);

  const handleExport = useCallback(() => {
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
  }, [exportWorkflow]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);

          if (!isValidWorkflow(data)) {
            console.warn('[Toolbar] Invalid workflow file structure');
            return;
          }

          useWorkflowStore.getState().loadWorkflow(data);
        } catch {
          console.warn('[Toolbar] Failed to parse workflow file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const handleSaveAs = useCallback(
    (newName: string) => {
      if (onSaveAs) {
        onSaveAs(newName);
      }
      setShowSaveAsDialog(false);
    },
    [onSaveAs],
  );

  const fileMenuItems: DropdownItem[] = useMemo(() => {
    const items: DropdownItem[] = [];

    // Prepend custom items
    if (fileMenuItemsPrepend?.length) {
      items.push(...fileMenuItemsPrepend);
      items.push({ id: 'separator-prepend', separator: true });
    }

    // Save As (only if callback is provided)
    if (onSaveAs) {
      items.push({
        icon: <SaveAll className="h-4 w-4" />,
        id: 'saveAs',
        label: 'Save As...',
        onClick: () => setShowSaveAsDialog(true),
      });
      items.push({ id: 'separator-saveas', separator: true });
    }

    // Export/Import
    items.push(
      {
        icon: <Save className="h-4 w-4" />,
        id: 'export',
        label: 'Export Workflow',
        onClick: handleExport,
      },
      {
        icon: <FolderOpen className="h-4 w-4" />,
        id: 'import',
        label: 'Import Workflow',
        onClick: handleImport,
      },
    );

    // Append custom items
    if (fileMenuItemsAppend?.length) {
      items.push({ id: 'separator-append', separator: true });
      items.push(...fileMenuItemsAppend);
    }

    return items;
  }, [
    handleExport,
    handleImport,
    onSaveAs,
    fileMenuItemsPrepend,
    fileMenuItemsAppend,
  ]);

  return (
    <div className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
      {/* Logo / Home Link */}
      {branding ?? (
        <a
          href={logoHref}
          title="Go to Dashboard"
          className="flex h-6 w-6 items-center justify-center transition hover:opacity-90"
        >
          <img src={logoSrc} alt="Genfeed" className="h-6 w-6 object-contain" />
        </a>
      )}

      {leftContent}

      {/* Divider */}
      <div className="h-8 w-px bg-border" />

      {/* File Menu */}
      <ToolbarDropdown label="File" items={fileMenuItems} />

      {/* Additional Menus */}
      {additionalMenus?.map((menu) => (
        <ToolbarDropdown
          key={menu.label}
          label={menu.label}
          items={menu.items}
        />
      ))}

      {/* Divider */}
      <div className="h-8 w-px bg-border" />

      {/* Debug Mode Badge */}
      {debugMode && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => openModal('settings')}
          title="Debug mode active - API calls are mocked"
          className="border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
        >
          <Bug className="h-4 w-4" />
          <span className="font-medium">Debug</span>
        </Button>
      )}

      {/* Auto-layout Button */}
      {onAutoLayout && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onAutoLayout('LR')}
          title="Auto-layout nodes"
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
      )}

      {/* Undo/Redo Buttons */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => undo()}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => redo()}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 className="h-4 w-4" />
      </Button>

      {/* Auto-Save Indicator */}
      {saveIndicator ?? <SaveIndicator />}

      {middleContent}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Additional right-side content */}
      {rightContent}

      {/* Shortcut Help */}
      {showShortcutHelp && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => openModal('shortcutHelp')}
          title="Keyboard shortcuts"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      )}

      {/* Settings */}
      {showSettings && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => openModal('settings')}
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      )}

      {/* Validation Errors Toast */}
      {uniqueErrorMessages.length > 0 && (
        <div className="fixed right-4 top-20 z-50 max-w-sm rounded-lg border border-destructive/30 bg-destructive/10 p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <h4 className="mb-2 text-sm font-medium text-destructive">
                Cannot run workflow
              </h4>
              <ul className="space-y-1">
                {uniqueErrorMessages.slice(0, 5).map((message) => (
                  <li key={message} className="text-xs text-destructive/80">
                    {message}
                  </li>
                ))}
                {uniqueErrorMessages.length > 5 && (
                  <li className="text-xs text-destructive/60">
                    +{uniqueErrorMessages.length - 5} more errors
                  </li>
                )}
              </ul>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={clearValidationErrors}
              className="text-destructive hover:bg-destructive/20"
              title="Dismiss validation errors"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Save As Dialog */}
      <SaveAsDialog
        isOpen={showSaveAsDialog}
        currentName={workflowName}
        onSave={handleSaveAs}
        onClose={() => setShowSaveAsDialog(false)}
      />
    </div>
  );
}
