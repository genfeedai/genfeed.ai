/**
 * Status helper utilities for workflow execution display.
 *
 * `workflow_executions.status` is a Prisma enum, so both the execution status
 * and every serialized node result status arrive as SCREAMING_SNAKE
 * `WorkflowExecutionStatus` labels. The engine's lowercase `skipped` outcome is
 * folded into `COMPLETED` by `mapEngineNodeStatus` before it reaches the wire.
 *
 * @see apps/server/api/src/collections/workflows/services/workflow-execution-status.util.ts
 * @see .agents/memory/rules/enum_source_of_truth.md
 */

import {
  WorkflowExecutionStatus,
  WorkflowLifecycle,
} from '@genfeedai/contracts';
import type { WorkflowLifecycle as WorkflowLifecycleContract } from '@genfeedai/workflows/contracts';

/**
 * Returns the appropriate icon for execution status
 */
export function getStatusIcon(status: WorkflowExecutionStatus): string {
  switch (status) {
    case WorkflowExecutionStatus.COMPLETED:
      return '✅'; // checkmark
    case WorkflowExecutionStatus.FAILED:
      return '❌'; // X
    case WorkflowExecutionStatus.RUNNING:
      return '⏳'; // hourglass
    case WorkflowExecutionStatus.CANCELLED:
      return '🚫'; // no entry
    default:
      return '⏸️'; // pause
  }
}

/**
 * Returns Tailwind CSS classes for execution status badge
 */
export function getStatusColor(status: WorkflowExecutionStatus): string {
  switch (status) {
    case WorkflowExecutionStatus.COMPLETED:
      return 'text-success bg-success/10';
    case WorkflowExecutionStatus.FAILED:
      return 'text-destructive bg-destructive/10';
    case WorkflowExecutionStatus.RUNNING:
      return 'text-warning bg-warning/10';
    case WorkflowExecutionStatus.CANCELLED:
      return 'text-muted-foreground bg-secondary';
    default:
      return 'text-muted-foreground bg-muted';
  }
}

/**
 * Returns Tailwind CSS classes for execution status border (for cards)
 */
export function getStatusBorderColor(status: WorkflowExecutionStatus): string {
  switch (status) {
    case WorkflowExecutionStatus.COMPLETED:
      return 'border-success/30 bg-success/10';
    case WorkflowExecutionStatus.FAILED:
      return 'border-destructive/30 bg-destructive/10';
    case WorkflowExecutionStatus.RUNNING:
      return 'border-warning/30 bg-warning/10';
    case WorkflowExecutionStatus.CANCELLED:
      return 'border-border bg-secondary';
    default:
      return 'border-border bg-card';
  }
}

/**
 * Returns Tailwind CSS classes for lifecycle status badge.
 *
 * `workflows.lifecycle` is a `String` column, so these labels stay lowercase.
 */
export function getLifecycleBadgeClass(
  lifecycle: WorkflowLifecycleContract | undefined,
): string {
  switch (lifecycle) {
    case WorkflowLifecycle.PUBLISHED:
      return 'border border-success/20 bg-success/10 text-success';
    case WorkflowLifecycle.ARCHIVED:
      return 'border border-border bg-foreground/[0.04] text-foreground/55';
    default:
      return 'border border-warning/20 bg-warning/10 text-warning';
  }
}

export function formatLifecycleLabel(
  lifecycle: WorkflowLifecycleContract | undefined,
): string {
  switch (lifecycle) {
    case WorkflowLifecycle.PUBLISHED:
      return 'Published';
    case WorkflowLifecycle.ARCHIVED:
      return 'Archived';
    default:
      return 'Draft';
  }
}

export function isNonDefaultWorkflowLifecycle(
  lifecycle: WorkflowLifecycleContract | undefined,
): boolean {
  return (
    lifecycle === WorkflowLifecycle.PUBLISHED ||
    lifecycle === WorkflowLifecycle.ARCHIVED
  );
}
