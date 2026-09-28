'use client';

import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import type { WorkflowScheduleSwitchProps } from './workflow-library.types';

/** Inline pause/resume for a scheduled workflow. Unscheduled workflows get nothing. */
export default function WorkflowScheduleSwitch({
  workflow,
  onToggleSchedule,
}: WorkflowScheduleSwitchProps) {
  const translate = useTranslations('common.automation.workflows.library');

  if (!workflow.schedule) {
    return null;
  }

  const isEnabled = workflow.isScheduleEnabled ?? false;

  return (
    <Switch
      aria-label={translate(
        isEnabled ? 'disableScheduleFor' : 'enableScheduleFor',
        { name: workflow.label },
      )}
      checked={isEnabled}
      onCheckedChange={onToggleSchedule}
    />
  );
}
