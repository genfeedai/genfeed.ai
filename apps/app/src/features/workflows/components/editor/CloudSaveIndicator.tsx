'use client';

import {
  HiOutlineArrowPath,
  HiOutlineCheck,
  HiOutlineCloud,
} from 'react-icons/hi2';

interface CloudSaveIndicatorProps {
  isSaving: boolean;
  isDirty: boolean;
}

export function CloudSaveIndicator({
  isSaving,
  isDirty,
}: CloudSaveIndicatorProps) {
  if (isSaving) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-400">
        <HiOutlineArrowPath
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin"
        />
        <span>Saving...</span>
      </div>
    );
  }

  if (isDirty) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-xs text-muted-foreground">
        <HiOutlineCloud aria-hidden="true" className="h-3.5 w-3.5" />
        <span>Unsaved</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
      <HiOutlineCheck aria-hidden="true" className="h-3.5 w-3.5" />
      <span>Saved</span>
    </div>
  );
}
