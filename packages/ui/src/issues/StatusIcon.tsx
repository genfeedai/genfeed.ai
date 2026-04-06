import {
  issueStatusIcon,
  issueStatusIconDefault,
} from '../tokens/status-colors';

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface StatusIconProps {
  status: string;
  className?: string;
  showLabel?: boolean;
}

export function StatusIcon({ status, className, showLabel }: StatusIconProps) {
  const colorClass = issueStatusIcon[status] ?? issueStatusIconDefault;
  const isDone = status === 'done';

  const circle = (
    <span
      className={cn(
        'relative inline-flex h-4 w-4 shrink-0 rounded-full border-2',
        colorClass,
        className,
      )}
    >
      {isDone && (
        <span className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-current" />
      )}
    </span>
  );

  if (showLabel) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {circle}
        <span className="text-sm">{statusLabel(status)}</span>
      </span>
    );
  }

  return circle;
}
