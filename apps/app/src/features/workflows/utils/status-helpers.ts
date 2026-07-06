/**
 * Status helper utilities for workflow execution display
 */

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type LifecycleStatus = 'draft' | 'published' | 'archived';

/**
 * Returns the appropriate icon for execution status
 */
export function getStatusIcon(status: ExecutionStatus | string): string {
  switch (status) {
    case 'completed':
      return '\u2705'; // checkmark
    case 'failed':
      return '\u274C'; // X
    case 'running':
      return '\u23F3'; // hourglass
    case 'cancelled':
      return '\uD83D\uDEAB'; // no entry
    case 'skipped':
      return '\u23ED\uFE0F'; // skip
    default:
      return '\u23F8\uFE0F'; // pause
  }
}

/**
 * Returns Tailwind CSS classes for execution status badge
 */
export function getStatusColor(status: ExecutionStatus | string): string {
  switch (status) {
    case 'completed':
      return 'text-success bg-success/10';
    case 'failed':
      return 'text-destructive bg-destructive/10';
    case 'running':
      return 'text-warning bg-warning/10';
    case 'cancelled':
      return 'text-muted-foreground bg-secondary';
    case 'skipped':
      return 'border-border bg-secondary';
    default:
      return 'text-muted-foreground bg-muted';
  }
}

/**
 * Returns Tailwind CSS classes for execution status border (for cards)
 */
export function getStatusBorderColor(status: ExecutionStatus | string): string {
  switch (status) {
    case 'completed':
      return 'border-success/30 bg-success/10';
    case 'failed':
      return 'border-destructive/30 bg-destructive/10';
    case 'running':
      return 'border-warning/30 bg-warning/10';
    case 'skipped':
      return 'border-border bg-secondary';
    default:
      return 'border-white/[0.08] bg-card';
  }
}

/**
 * Returns Tailwind CSS classes for lifecycle status badge
 */
export function getLifecycleBadgeClass(
  lifecycle: LifecycleStatus | string | undefined,
): string {
  switch (lifecycle) {
    case 'published':
      return 'border border-success/20 bg-success/10 text-success';
    case 'archived':
      return 'border border-white/10 bg-white/[0.04] text-white/55';
    default:
      return 'border border-warning/20 bg-warning/10 text-warning';
  }
}
