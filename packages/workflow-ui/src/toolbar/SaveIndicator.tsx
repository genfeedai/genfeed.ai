'use client';

import { Check, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { useWorkflowStore } from '../stores/workflow';
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
        <CloudOff className="size-3.5" />
        <span>Auto-save off</span>
      </Button>
    );
  }

  if (isSaving) {
    return (
      <div
        className={
          isPill
            ? 'flex items-center gap-1.5 rounded-full border border-info/20 bg-info/10 px-2.5 py-1 text-xs text-info'
            : 'flex items-center gap-1.5 text-xs text-info'
        }
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Saving…</span>
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
        <Cloud className="size-3.5" />
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
          ? 'rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-xs text-success hover:text-success/80'
          : 'text-xs text-success hover:text-success/80 h-auto p-0'
      }
    >
      <Check className="size-3.5" />
      <span>Saved</span>
    </Button>
  );
}
