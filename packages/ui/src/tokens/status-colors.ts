/**
 * Canonical status & priority color definitions.
 * Every component that renders a status indicator should import from here.
 */

export const issueStatusIcon: Record<string, string> = {
  backlog: 'text-muted-foreground border-muted-foreground',
  blocked: 'text-destructive border-destructive',
  cancelled: 'text-muted-foreground border-muted-foreground',
  done: 'text-success border-success',
  in_progress: 'text-warning border-warning',
  in_review: 'text-info border-info',
  todo: 'text-info border-info',
};

export const issueStatusIconDefault =
  'text-muted-foreground border-muted-foreground';

export const issueStatusText: Record<string, string> = {
  backlog: 'text-muted-foreground',
  blocked: 'text-destructive',
  cancelled: 'text-muted-foreground',
  done: 'text-success',
  in_progress: 'text-warning',
  in_review: 'text-info',
  todo: 'text-info',
};

export const issueStatusTextDefault = 'text-muted-foreground';

export const statusBadge: Record<string, string> = {
  achieved: 'bg-success/10 text-success',
  active: 'bg-success/10 text-success',
  approved: 'bg-success/10 text-success',
  archived: 'bg-muted text-muted-foreground',
  backlog: 'bg-muted text-muted-foreground',
  blocked: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
  completed: 'bg-success/10 text-success',
  done: 'bg-success/10 text-success',
  error: 'bg-destructive/10 text-destructive',
  failed: 'bg-destructive/10 text-destructive',
  idle: 'bg-warning/10 text-warning',
  in_progress: 'bg-warning/10 text-warning',
  in_review: 'bg-info/10 text-info',
  paused: 'bg-warning/10 text-warning',
  pending: 'bg-warning/10 text-warning',
  pending_approval: 'bg-warning/10 text-warning',
  planned: 'bg-muted text-muted-foreground',
  rejected: 'bg-destructive/10 text-destructive',
  revision_requested: 'bg-warning/10 text-warning',
  running: 'bg-info/10 text-info',
  succeeded: 'bg-success/10 text-success',
  terminated: 'bg-destructive/10 text-destructive',
  timed_out: 'bg-warning/10 text-warning',
  todo: 'bg-info/10 text-info',
};

export const statusBadgeDefault = 'bg-muted text-muted-foreground';

export const agentStatusDot: Record<string, string> = {
  active: 'bg-success',
  archived: 'bg-muted-foreground',
  error: 'bg-destructive',
  idle: 'bg-warning',
  paused: 'bg-warning',
  pending_approval: 'bg-warning',
  running: 'bg-[#38bdf8] animate-pulse',
};

export const agentStatusDotDefault = 'bg-muted-foreground';

export const priorityColor: Record<string, string> = {
  critical: 'text-destructive',
  high: 'text-warning',
  low: 'text-info',
  medium: 'text-warning',
};

export const priorityColorDefault = 'text-warning';
