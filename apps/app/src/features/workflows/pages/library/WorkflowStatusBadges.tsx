'use client';

import { Cloud, CloudUpload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  formatLifecycleLabel,
  getLifecycleBadgeClass,
  isNonDefaultWorkflowLifecycle,
} from '@/features/workflows/utils/status-helpers';
import type { WorkflowStatusBadgesProps } from './workflow-library.types';

/** System, cloud-sync and non-default lifecycle state. Renders nothing when all are default. */
export default function WorkflowStatusBadges({
  workflow,
  isSystemWorkflow,
  isCloudStateVisible,
}: WorkflowStatusBadgesProps) {
  const translate = useTranslations('common.automation.workflows.library');
  const hasLifecycleBadge = isNonDefaultWorkflowLifecycle(workflow.lifecycle);

  if (!isSystemWorkflow && !isCloudStateVisible && !hasLifecycleBadge) {
    return null;
  }

  return (
    <span className="flex shrink-0 items-center gap-1 text-xs font-normal">
      {isSystemWorkflow ? (
        <span className="rounded-full bg-info/10 px-2 py-0.5 text-info">
          {translate('system')}
        </span>
      ) : null}
      {isCloudStateVisible && workflow.cloudSync ? (
        <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-success">
          <Cloud className="size-3" />
          {translate('synced')}
        </span>
      ) : isCloudStateVisible ? (
        <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
          <CloudUpload className="size-3" />
          {translate('local')}
        </span>
      ) : null}
      {hasLifecycleBadge ? (
        <span
          className={`rounded-full px-2 py-0.5 ${getLifecycleBadgeClass(
            workflow.lifecycle,
          )}`}
        >
          {formatLifecycleLabel(workflow.lifecycle)}
        </span>
      ) : null}
    </span>
  );
}
