import type { ReactElement } from 'react';
import type { WorkflowSummary } from '@/features/workflows/services/workflow-api';

type LifecycleStatus = WorkflowSummary['lifecycle'];

export function formatWorkflowRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) {
    return 'Just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }
  return new Date(dateString).toLocaleDateString();
}

export function WorkflowLifecycleDot({
  lifecycle,
}: {
  lifecycle: LifecycleStatus;
}): ReactElement {
  const dotClasses: Record<LifecycleStatus, string> = {
    archived: 'bg-muted-foreground opacity-50',
    draft: 'border border-muted-foreground bg-transparent',
    published: 'bg-white',
  };

  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotClasses[lifecycle]}`}
    />
  );
}
