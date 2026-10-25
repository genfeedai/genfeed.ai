'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { EditorSaveIndicatorProps } from '@props/studio/editor-save-indicator.props';
import { useTranslations } from 'next-intl';

/**
 * Saving / saved / failed state of the Editor autosave. A polite live region,
 * so a screen reader hears a failure without losing focus.
 */
export default function EditorSaveIndicator({
  isDirty,
  saveStatus,
}: EditorSaveIndicatorProps) {
  const translate = useTranslations('pages.studioEditor.toolbar');

  let label: string | null = null;
  if (saveStatus === 'failed') {
    label = translate('saveFailed');
  } else if (saveStatus === 'saving') {
    label = translate('saving');
  } else if (isDirty) {
    label = translate('unsaved');
  } else if (saveStatus === 'saved') {
    label = translate('saved');
  }

  return (
    <span
      aria-live="polite"
      className={cn(
        'text-xs',
        saveStatus === 'failed' ? 'text-destructive' : 'text-muted-foreground',
      )}
      data-save-status={saveStatus}
      data-testid="editor-save-status"
    >
      {label}
    </span>
  );
}
