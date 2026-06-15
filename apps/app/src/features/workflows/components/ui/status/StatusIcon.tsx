'use client';

import type { WorkflowNodeStatus } from '@genfeedai/enums';
import {
  AlertCircleIcon,
  CheckIcon,
  LoaderIcon,
} from '@/features/workflows/components/ui/icons';

interface StatusIconProps {
  status: WorkflowNodeStatus;
}

/**
 * Status icon based on node status
 */
export function StatusIcon({
  status,
}: StatusIconProps): React.JSX.Element | null {
  switch (status) {
    case 'complete':
      return <CheckIcon className="size-4" />;
    case 'error':
      return <AlertCircleIcon className="size-4" />;
    case 'processing':
      return <LoaderIcon className="size-4 animate-spin" />;
    default:
      return null;
  }
}
