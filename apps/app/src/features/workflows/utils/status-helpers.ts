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
      return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900';
    case 'failed':
      return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900';
    case 'running':
      return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900';
    case 'cancelled':
      return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800';
    case 'skipped':
      return 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900';
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
      return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950';
    case 'failed':
      return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950';
    case 'running':
      return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950';
    case 'skipped':
      return 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900';
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
      return 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
    case 'archived':
      return 'border border-white/10 bg-white/[0.04] text-white/55';
    default:
      return 'border border-amber-500/20 bg-amber-500/10 text-amber-300';
  }
}
