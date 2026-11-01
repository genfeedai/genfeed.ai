'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';

import type { WorkflowFile } from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import { toast } from '@genfeedai/ui/primitives/toaster';
import {
  Bug,
  CircleQuestionMark,
  FolderOpen,
  LayoutGrid,
  Redo2,
  Save,
  Settings,
  Undo2,
} from 'lucide-react';
import NextImage from 'next/image';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useExecutionStore } from '../stores/execution';
import { getWorkflowLogger } from '../stores/executionLogger';
import { useSettingsStore } from '../stores/settingsStore';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflow';
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

interface ToolbarLogoProps {
  branding?: ReactNode;
  logoHref?: string;
  logoSrc?: string;
}

function ToolbarLogo({ branding, logoHref, logoSrc }: ToolbarLogoProps) {
  if (branding !== undefined) {
    return branding;
  }

  if (!logoSrc) {
    return null;
  }

  return (
    <a
      href={logoHref ?? '/'}
      title="Go to Overview"
      className="flex size-6 items-center justify-center transition hover:opacity-90"
    >
      <NextImage
        src={logoSrc}
        alt="Genfeed"
        width={24}
        height={24}
        className="size-6 object-contain"
        unoptimized
      />
    </a>
  );
}

interface FileMenuOptions {
  fileMenuItemsAppend?: DropdownItem[];
  fileMenuItemsPrepend?: DropdownItem[];
  handleExport: () => void;
  handleImport: () => void;
}

function useFileMenuItems({
  fileMenuItemsAppend,
  fileMenuItemsPrepend,
  handleExport,
  handleImport,
}: FileMenuOptions): DropdownItem[] {
  return useMemo(() => {
    const items: DropdownItem[] = [];

    if (fileMenuItemsPrepend?.length) {
      items.push(...fileMenuItemsPrepend);
      items.push({ id: 'separator-prepend', separator: true });
    }

    items.push(
      {
        icon: <Save className="size-4" />,
        id: 'export',
        label: 'Export Workflow',
        onClick: handleExport,
      },
      {
        icon: <FolderOpen className="size-4" />,
        id: 'import',
        label: 'Import Workflow',
        onClick: handleImport,
      },
    );

    if (fileMenuItemsAppend?.length) {
      items.push({ id: 'separator-append', separator: true });
      items.push(...fileMenuItemsAppend);
    }

    return items;
  }, [handleExport, handleImport, fileMenuItemsPrepend, fileMenuItemsAppend]);
}

const VALIDATION_TOAST_ID = 'workflow-validation-errors';
const MAX_VISIBLE_VALIDATION_ERRORS = 5;

function ValidationErrorList({ messages }: { messages: string[] }) {
  return (
    <ul className="space-y-1">
      {messages.slice(0, MAX_VISIBLE_VALIDATION_ERRORS).map((message) => (
        <li key={message}>{message}</li>
      ))}
      {messages.length > MAX_VISIBLE_VALIDATION_ERRORS && (
        <li>+{messages.length - MAX_VISIBLE_VALIDATION_ERRORS} more errors</li>
      )}
    </ul>
  );
}

/**
 * Surfaces workflow validation failures through the shared toaster. The toast
 * stays until dismissed; dismissing it clears the validation errors. Sonner also
 * calls `onDismiss` for programmatic dismissal, so unmounting the toolbar must
 * not clear the errors: the guard ref skips `onClear` once the hook is gone.
 */
function useValidationErrorToast(
  messages: string[],
  onClear: () => void,
): void {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      toast.dismiss(VALIDATION_TOAST_ID);
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      toast.dismiss(VALIDATION_TOAST_ID);
      return;
    }

    toast.error('Cannot run workflow', {
      description: <ValidationErrorList messages={messages} />,
      duration: Number.POSITIVE_INFINITY,
      id: VALIDATION_TOAST_ID,
      onDismiss: () => {
        if (isMountedRef.current) {
          onClear();
        }
      },
    });
  }, [messages, onClear]);
}

export function Toolbar({
  onAutoLayout,
  fileMenuItemsPrepend,
  fileMenuItemsAppend,
  additionalMenus,
  branding,
  leftContent,
  middleContent,
  saveIndicator,
  logoHref,
  logoSrc,
  showSettings = true,
  showShortcutHelp = false,
  embedded = false,
  rightContent,
}: ToolbarProps) {
  const { exportWorkflow } = useWorkflowStore();
  const { undo, redo } = useWorkflowStore.temporal.getState();
  const [historyState, setHistoryState] = useState({
    canRedo: false,
    canUndo: false,
  });
  const { canRedo, canUndo } = historyState;
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

  useValidationErrorToast(uniqueErrorMessages, clearValidationErrors);

  // Subscribe to temporal state changes for undo/redo button states
  useEffect(() => {
    const unsubscribe = useWorkflowStore.temporal.subscribe((state) => {
      setHistoryState({
        canRedo: state.futureStates.length > 0,
        canUndo: state.pastStates.length > 0,
      });
    });
    const temporal = useWorkflowStore.temporal.getState();
    setHistoryState({
      canRedo: temporal.futureStates.length > 0,
      canUndo: temporal.pastStates.length > 0,
    });
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
            getWorkflowLogger().error(
              '[Toolbar] Invalid workflow file structure',
            );
            return;
          }

          useWorkflowStore.getState().loadWorkflow(data);
        } catch (error) {
          getWorkflowLogger().error('[Toolbar] Failed to parse workflow file', {
            error,
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const fileMenuItems = useFileMenuItems({
    fileMenuItemsAppend,
    fileMenuItemsPrepend,
    handleExport,
    handleImport,
  });

  return (
    <div
      className={
        embedded
          ? 'flex min-w-0 flex-1 items-center gap-2'
          : 'flex h-14 items-center gap-3 border-b border-border bg-card px-4'
      }
      data-testid="workflow-toolbar"
    >
      {embedded ? null : (
        <ToolbarLogo
          branding={branding}
          logoHref={logoHref}
          logoSrc={logoSrc}
        />
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
          withWrapper={false}
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          onClick={() => openModal('settings')}
          title="Debug mode active - API calls are mocked"
          className="border-warning/20 bg-warning/10 text-warning hover:bg-warning/20"
        >
          <Bug className="size-4" />
          <span className="font-medium">Debug</span>
        </Button>
      )}

      {/* Auto-layout Button */}
      {onAutoLayout && (
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={() => onAutoLayout('LR')}
          title="Auto-layout nodes"
        >
          <LayoutGrid className="size-4" />
        </Button>
      )}

      {/* Undo/Redo Buttons */}
      <Button
        withWrapper={false}
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        onClick={() => undo()}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 className="size-4" />
      </Button>
      <Button
        withWrapper={false}
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        onClick={() => redo()}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 className="size-4" />
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
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={() => openModal('shortcutHelp')}
          title="Keyboard shortcuts"
        >
          <CircleQuestionMark className="size-4" />
        </Button>
      )}

      {/* Settings */}
      {showSettings && (
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={() => openModal('settings')}
          title="Settings"
        >
          <Settings className="size-4" />
        </Button>
      )}
    </div>
  );
}
