'use client';

import { Badge } from '@ui/primitives/badge';
import { Cloud, CloudUpload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  formatLifecycleLabel,
  getLifecycleBadgeVariant,
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
        <Badge variant="info">{translate('system')}</Badge>
      ) : null}
      {isCloudStateVisible && workflow.cloudSync ? (
        <Badge icon={<Cloud />} variant="success">
          {translate('synced')}
        </Badge>
      ) : isCloudStateVisible ? (
        <Badge icon={<CloudUpload />} variant="secondary">
          {translate('local')}
        </Badge>
      ) : null}
      {hasLifecycleBadge ? (
        <Badge variant={getLifecycleBadgeVariant(workflow.lifecycle)}>
          {formatLifecycleLabel(workflow.lifecycle)}
        </Badge>
      ) : null}
    </span>
  );
}
