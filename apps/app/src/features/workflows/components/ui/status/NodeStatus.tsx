'use client';

import type { WorkflowNodeStatus } from '@genfeedai/enums';
import {
  AlertCircleIcon,
  CheckIcon,
  LoaderIcon,
} from '@/features/workflows/components/ui/icons/node-icons';

interface ProcessingMessageProps {
  message: string;
}

interface HelpTextProps {
  children: React.ReactNode;
}

interface StatusIconProps {
  status: WorkflowNodeStatus;
}

/**
 * Processing state message with animation
 */
export function ProcessingMessage({
  message,
}: ProcessingMessageProps): React.JSX.Element {
  return (
    <div className="text-center py-2 text-sm text-muted-foreground animate-pulse">
      {message}
    </div>
  );
}

/**
 * Help text displayed when node is waiting for input
 */
export function HelpText({ children }: HelpTextProps): React.JSX.Element {
  return (
    <div className="text-xs text-muted-foreground text-center">{children}</div>
  );
}

/**
 * Status icon based on node status
 */
export function StatusIcon({
  status,
}: StatusIconProps): React.JSX.Element | null {
  switch (status) {
    case 'complete':
      return <CheckIcon />;
    case 'error':
      return <AlertCircleIcon />;
    case 'processing':
      return <LoaderIcon />;
    default:
      return null;
  }
}

/**
 * Get status color class based on node status
 */
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
