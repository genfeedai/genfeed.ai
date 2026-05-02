import { cn } from '../lib/utils';
import { priorityColor, priorityColorDefault } from '../tokens/status-colors';

type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

const priorityConfig: Record<
  PriorityLevel,
  { symbol: string; color: string; label: string }
> = {
  critical: {
    symbol: '⚠',
    color: priorityColor.critical ?? priorityColorDefault,
    label: 'Critical',
  },
  high: {
    symbol: '↑',
    color: priorityColor.high ?? priorityColorDefault,
    label: 'High',
  },
  low: {
    symbol: '↓',
    color: priorityColor.low ?? priorityColorDefault,
    label: 'Low',
  },
  medium: {
    symbol: '—',
    color: priorityColor.medium ?? priorityColorDefault,
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
        'inline-flex shrink-0 items-center justify-center text-sm',
        config.color,
        className,
      )}
    >
      {config.symbol}
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
