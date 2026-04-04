'use client';

import { ComponentSize } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { StatusDotProps } from '@props/ui/display/status-dot.props';
import { memo } from 'react';

const SIZE_CLASSES = {
  [ComponentSize.SM]: 'gen-dot-sm',
  [ComponentSize.MD]: '',
  [ComponentSize.LG]: 'gen-dot-lg',
} as const;

const STATUS_CLASSES = {
  error: 'gen-dot-error',
  info: 'gen-dot-info',
  muted: 'gen-dot-muted',
  processing: 'gen-dot-processing',
  success: 'gen-dot-success',
  warning: 'gen-dot-warning',
} as const;

/**
 * StatusDot - A simple status indicator dot
 * Uses CSS classes from genfeed.scss for consistent theming
 */
const StatusDot = memo(function StatusDot({
  status,
  pulse = false,
  size = ComponentSize.MD,
  className,
}: StatusDotProps) {
  return (
    <span
      className={cn(
        'gen-dot',
        SIZE_CLASSES[size],
        STATUS_CLASSES[status],
        pulse && 'gen-dot-pulse',
        className,
      )}
      role="status"
      aria-label={`Status: ${status}`}
    />
  );
});

export default StatusDot;
