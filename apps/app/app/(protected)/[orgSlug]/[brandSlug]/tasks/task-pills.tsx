import { ComponentSize } from '@genfeedai/contracts';
import type { TaskPillSelectProps } from '@props/tasks/task-pills.props';
import type {
  TaskPriority,
  TaskStatus,
} from '@services/management/tasks.service';
import Badge from '@ui/display/badge/Badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ChevronDown, ChevronsUp, ChevronUp, Minus } from 'lucide-react';

export {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
} from './task-status.constants';

import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
} from './task-status.constants';

const PRIORITY_VARIANTS: Record<
  TaskPriority,
  'error' | 'warning' | 'info' | 'secondary'
> = {
  critical: 'error',
  high: 'warning',
  low: 'secondary',
  medium: 'info',
};

const PRIORITY_ICONS: Record<TaskPriority, typeof ChevronsUp> = {
  critical: ChevronsUp,
  high: ChevronUp,
  low: ChevronDown,
  medium: Minus,
};

/** Strips field chrome so the badge itself is the select trigger. */
const PILL_TRIGGER_CLASS =
  'h-auto w-auto rounded-full border-0 bg-transparent p-0 shadow-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring';

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge status={status} size={ComponentSize.SM}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  const Icon = PRIORITY_ICONS[priority];
  return (
    <Badge
      variant={PRIORITY_VARIANTS[priority]}
      size={ComponentSize.SM}
      icon={<Icon aria-hidden="true" className="size-3" />}
    >
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function TaskStatusSelect({
  ariaLabel,
  isDisabled = false,
  onChange,
  value,
}: TaskPillSelectProps<TaskStatus>) {
  return (
    <Select
      value={value}
      disabled={isDisabled}
      onValueChange={(status) => onChange(status as TaskStatus)}
    >
      <SelectTrigger
        hideIndicator
        aria-label={ariaLabel}
        className={PILL_TRIGGER_CLASS}
        onClick={(event) => event.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_ORDER.map((status) => (
          <SelectItem key={status} value={status}>
            <TaskStatusBadge status={status} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TaskPrioritySelect({
  ariaLabel,
  isDisabled = false,
  onChange,
  value,
}: TaskPillSelectProps<TaskPriority>) {
  return (
    <Select
      value={value}
      disabled={isDisabled}
      onValueChange={(priority) => onChange(priority as TaskPriority)}
    >
      <SelectTrigger
        hideIndicator
        aria-label={ariaLabel}
        className={PILL_TRIGGER_CLASS}
        onClick={(event) => event.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRIORITY_ORDER.map((priority) => (
          <SelectItem key={priority} value={priority}>
            <TaskPriorityBadge priority={priority} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
