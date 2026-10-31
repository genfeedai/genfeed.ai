import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import type { WorkflowSummary } from '@/features/workflows/services/workflow-api';

/**
 * Props for the library's row and card. They reference the app-local
 * `WorkflowSummary`, which `packages/props` cannot import, so they live beside
 * the feature like the other workflow feature props.
 */
export interface WorkflowLibraryItemProps {
  workflow: WorkflowSummary;
  executionCount?: number;
  isReadOnly?: boolean;
  openHref: string;
  isSelected: boolean;
  isSystemWorkflow: boolean;
  /** Desktop shell with a connected cloud session: show synced/local state. */
  isCloudStateVisible: boolean;
  overflowActions: CollectionOverflowAction[];
  onToggleSelected: () => void;
  onToggleSchedule: (isEnabled: boolean) => void;
}

export interface WorkflowStatusBadgesProps {
  workflow: WorkflowSummary;
  isSystemWorkflow: boolean;
  isCloudStateVisible: boolean;
}

export interface WorkflowFactLineProps {
  workflow: WorkflowSummary;
  className?: string;
}

export interface WorkflowScheduleSwitchProps {
  workflow: WorkflowSummary;
  onToggleSchedule: (isEnabled: boolean) => void;
}

export interface WorkflowOpenActionProps {
  name: string;
  href: string;
}
