'use client';

import { Check, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { useWorkflowStore } from '../stores/workflowStore';
import { Button } from '../ui/button';
import type { SaveIndicatorProps } from './types';

/**
 * Auto-save status indicator
 */
export function SaveIndicator({
  isDirty: isDirtyProp,
  isSaving: isSavingProp,
  variant = 'default',
}: SaveIndicatorProps) {
  const storeIsDirty = useWorkflowStore((state) => state.isDirty);
  const storeIsSaving = useWorkflowStore((state) => state.isSaving);
  const autoSaveEnabled = useSettingsStore((state) => state.autoSaveEnabled);
  const toggleAutoSave = useSettingsStore((state) => state.toggleAutoSave);
  const isDirty = isDirtyProp ?? storeIsDirty;
  const isSaving = isSavingProp ?? storeIsSaving;
  const isPill = variant === 'pill';

  if (!autoSaveEnabled) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleAutoSave}
        title="Click to enable auto-save"
        className="text-xs text-muted-foreground hover:text-foreground h-auto p-0"
      >
        <CloudOff className="h-3.5 w-3.5" />
        <span>Auto-save off</span>
      </Button>
    );
  }

  if (isSaving) {
    return (
      <div
        className={
          isPill
            ? 'flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-400'
            : 'flex items-center gap-1.5 text-xs text-blue-500'
        }
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Saving...</span>
      </div>
    );
  }

  if (isDirty) {
    return (
      <div
        className={
          isPill
            ? 'flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-xs text-muted-foreground'
            : 'flex items-center gap-1.5 text-xs text-muted-foreground'
        }
      >
        <Cloud className="h-3.5 w-3.5" />
        <span>Unsaved</span>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleAutoSave}
      title="Click to disable auto-save"
      className={
        isPill
          ? 'rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400 hover:text-emerald-300'
          : 'text-xs text-green-500 hover:text-green-400 h-auto p-0'
      }
    >
      <Check className="h-3.5 w-3.5" />
      <span>Saved</span>
    </Button>
  );
}
