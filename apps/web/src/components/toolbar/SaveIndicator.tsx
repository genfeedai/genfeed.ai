'use client';

import { Check, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorkflowStore } from '@/store/workflowStore';

/**
 * Auto-save status indicator
 */
export function SaveIndicator() {
  const isDirty = useWorkflowStore((state) => state.isDirty);
  const isSaving = useWorkflowStore((state) => state.isSaving);
  const autoSaveEnabled = useSettingsStore((state) => state.autoSaveEnabled);
  const toggleAutoSave = useSettingsStore((state) => state.toggleAutoSave);

  if (!autoSaveEnabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggleAutoSave}
            className="flex items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground transition-colors"
          >
            <CloudOff className="h-3.5 w-3.5" />
            <span>Auto-save off</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Click to enable auto-save</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isSaving) {
    return (
      <div className="flex items-center gap-1.5 text-blue-500 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Saving...</span>
      </div>
    );
  }

  if (isDirty) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Cloud className="h-3.5 w-3.5" />
        <span>Unsaved</span>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={toggleAutoSave}
          className="flex items-center gap-1.5 text-green-500 text-xs hover:text-green-400 transition-colors"
        >
          <Check className="h-3.5 w-3.5" />
          <span>Saved</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>Click to disable auto-save</p>
      </TooltipContent>
    </Tooltip>
  );
}
