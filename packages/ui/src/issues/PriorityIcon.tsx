import { cn } from '@genfeedai/helpers';
import {
  ArrowDown,
  ArrowUp,
  type LucideIcon,
  Minus,
  TriangleAlert,
} from 'lucide-react';
import { priorityColor } from '../tokens/status-colors';

type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

const priorityConfig: Record<
  PriorityLevel,
  { Icon: LucideIcon; color: string; label: string }
> = {
  critical: {
    Icon: TriangleAlert,
    color: priorityColor.critical,
    label: 'Critical',
  },
  high: {
    Icon: ArrowUp,
    color: priorityColor.high,
    label: 'High',
  },
  low: {
    Icon: ArrowDown,
    color: priorityColor.low,
    label: 'Low',
  },
  medium: {
    Icon: Minus,
    color: priorityColor.medium,
    label: 'Medium',
  },
};

interface PriorityIconProps {
  priority: string;
  className?: string;
  showLabel?: boolean;
}

export function PriorityIcon({
  priority,
  className,
  showLabel,
}: PriorityIconProps) {
  const config =
    priorityConfig[priority as PriorityLevel] ?? priorityConfig.medium;

  const icon = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        config.color,
        className,
      )}
      {...(showLabel ? {} : { role: 'img', 'aria-label': config.label })}
    >
      <config.Icon aria-hidden="true" className="size-4" />
    </span>
  );

  if (showLabel) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {icon}
        <span className="text-sm">{config.label}</span>
      </span>
    );
  }

  return icon;
}
