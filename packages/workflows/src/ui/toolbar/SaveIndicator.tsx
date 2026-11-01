'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Badge } from '@genfeedai/ui/primitives/badge';
import { Button } from '@genfeedai/ui/primitives/button';
import Spinner from '@genfeedai/ui/primitives/spinner';
import { Check, Cloud, CloudOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useWorkflowStore } from '../stores/workflow';
import type { SaveIndicatorProps } from './types';

function SaveStatus({
  icon,
  isPill,
  label,
  variant,
}: {
  icon: ReactNode;
  isPill: boolean;
  label: string;
  variant: 'info' | 'secondary';
}) {
  if (isPill) {
    return (
      <Badge
        casing="normal"
        icon={icon}
        shape="pill"
        size="lg"
        variant={variant}
      >
        {label}
      </Badge>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 text-xs ${variant === 'info' ? 'text-info' : 'text-muted-foreground'}`}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

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
  const workflowId = useWorkflowStore((state) => state.workflowId);
  const autoSaveEnabled = useSettingsStore((state) => state.autoSaveEnabled);
  const toggleAutoSave = useSettingsStore((state) => state.toggleAutoSave);
  const isDirty = isDirtyProp ?? storeIsDirty;
  const isSaving = isSavingProp ?? storeIsSaving;
  const isPersisted = Boolean(workflowId);
  const isPill = variant === 'pill';

  if (!autoSaveEnabled) {
    return (
      <Button
        withWrapper={false}
        variant={ButtonVariant.GHOST}
        size={ButtonSize.INLINE}
        onClick={toggleAutoSave}
        tooltip="Click to enable auto-save"
      >
        <CloudOff className="size-3.5" />
        <span>Auto-save off</span>
      </Button>
    );
  }

  if (isSaving) {
    return (
      <SaveStatus
        icon={<Spinner className="size-3.5" />}
        isPill={isPill}
        label="Saving…"
        variant="info"
      />
    );
  }

  if (isDirty || !isPersisted) {
    return (
      <SaveStatus
        icon={<Cloud className="size-3.5" />}
        isPill={isPill}
        label="Unsaved"
        variant="secondary"
      />
    );
  }

  return (
    // ui-guard-allow:button-restyle -- saved state is a success-toned status that is also the auto-save toggle
    <Button
      withWrapper={false}
      variant={ButtonVariant.GHOST}
      size={isPill ? ButtonSize.SM : ButtonSize.INLINE}
      onClick={toggleAutoSave}
      tooltip="Click to disable auto-save"
      className={
        isPill
          ? 'rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-xs text-success hover:text-success/80'
          : 'text-xs text-success hover:text-success/80'
      }
    >
      <Check className="size-3.5" />
      <span>Saved</span>
    </Button>
  );
}
