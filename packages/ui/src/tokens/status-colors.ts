/**
 * Canonical status & priority color definitions.
 * Every component that renders a status indicator should import from here.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  Ban,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock3,
  Eye,
  ListTodo,
  Pause,
  Play,
  RotateCcw,
  TimerOff,
} from 'lucide-react';

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

export const statusBadge = {
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
} as const;

export type StatusKey = keyof typeof statusBadge;

export const statusIcon: Record<StatusKey, LucideIcon> = {
  achieved: CircleCheck,
  active: CircleCheck,
  approved: CircleCheck,
  archived: Archive,
  backlog: ListTodo,
  blocked: Ban,
  cancelled: CircleX,
  completed: CircleCheck,
  done: CircleCheck,
  error: CircleAlert,
  failed: CircleAlert,
  idle: Clock3,
  in_progress: Play,
  in_review: Eye,
  paused: Pause,
  pending: Clock3,
  pending_approval: Clock3,
  planned: ListTodo,
  rejected: CircleX,
  revision_requested: RotateCcw,
  running: Play,
  succeeded: CircleCheck,
  terminated: CircleX,
  timed_out: TimerOff,
  todo: ListTodo,
};

export const statusIconDefault = Clock3;

export const statusBadgeDefault = 'bg-muted text-muted-foreground';

export const priorityColor: Record<string, string> = {
  critical: 'text-destructive',
  high: 'text-warning',
  low: 'text-info',
  medium: 'text-warning',
};

export const priorityColorDefault = 'text-warning';
