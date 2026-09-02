import { cn } from '@genfeedai/helpers';
import {
  issueStatusText,
  issueStatusTextDefault,
  statusIcon,
  statusIconDefault,
} from '../tokens/status-colors';

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface StatusIconProps {
  status: string;
  className?: string;
  showLabel?: boolean;
}

export function StatusIcon({ status, className, showLabel }: StatusIconProps) {
  const colorClass = issueStatusText[status] ?? issueStatusTextDefault;
  const Icon =
    statusIcon[status as keyof typeof statusIcon] ?? statusIconDefault;
  const label = statusLabel(status);

  const glyph = (
    <Icon
      aria-hidden={showLabel || undefined}
      aria-label={showLabel ? undefined : label}
      className={cn('size-4 shrink-0', colorClass, className)}
      role={showLabel ? undefined : 'img'}
    />
  );

  if (showLabel) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {glyph}
        <span className="text-sm">{label}</span>
      </span>
    );
  }

  return glyph;
}
