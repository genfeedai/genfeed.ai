import type { WorkflowNodeStatus } from '@genfeedai/enums';

export function getStatusColor(status: WorkflowNodeStatus): string {
  switch (status) {
    case 'complete':
      return 'text-green-500';
    case 'error':
      return 'text-red-500';
    case 'processing':
      return 'text-blue-500';
    default:
      return 'text-muted-foreground';
  }
}
