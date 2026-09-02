'use client';

import { cn } from '@genfeedai/helpers';
import { NodeResizer } from '@xyflow/react';
import type { ComponentProps, ReactNode } from 'react';
import { Badge } from '../primitives/badge';

export type FlowNodeTone =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent';
export type FlowNodeShellStatus =
  | 'idle'
  | 'running'
  | 'success'
  | 'warning'
  | 'error';

export type FlowNodeShellProps = Omit<ComponentProps<'div'>, 'title'> & {
  description?: ReactNode;
  dimmed?: boolean;
  footer?: ReactNode;
  headerActions?: ReactNode;
  meta?: ReactNode;
  minHeight?: number;
  minWidth?: number;
  resizable?: boolean;
  selected?: boolean;
  status?: FlowNodeShellStatus;
  statusLabel?: ReactNode;
  title: ReactNode;
  tone?: FlowNodeTone;
};

const toneClassName: Record<FlowNodeTone, string> = {
  accent: 'border-border-strong',
  danger: 'border-destructive/25',
  default: 'border-border',
  info: 'border-info/25',
  success: 'border-success/25',
  warning: 'border-warning/25',
};

const statusVariant = {
  error: 'destructive',
  idle: null,
  running: 'info',
  success: 'success',
  warning: 'warning',
} as const;

const statusLabel = {
  error: 'Error',
  idle: '',
  running: 'Running',
  success: 'Success',
  warning: 'Warning',
} as const;

export function FlowNodeShell({
  title,
  description,
  meta,
  headerActions,
  footer,
  tone = 'default',
  status = 'idle',
  statusLabel: customStatusLabel,
  selected = false,
  dimmed = false,
  resizable = false,
  minWidth = 220,
  minHeight = 120,
  className,
  children,
  ...props
}: FlowNodeShellProps) {
  return (
    <div
      data-selected={selected}
      className={cn(
        'relative min-w-[220px] rounded-xl border bg-secondary text-foreground shadow-ambient-md transition-[border-color,box-shadow,opacity] duration-200',
        toneClassName[tone],
        selected && 'ring-1 ring-foreground/25',
        dimmed && 'opacity-60',
        className,
      )}
      {...props}
    >
      {resizable ? (
        <NodeResizer
          isVisible={selected}
          minWidth={minWidth}
          minHeight={minHeight}
          lineClassName="border-info/35"
          handleClassName="rounded-full border border-border bg-elevated"
        />
      ) : null}

      <div className="flex items-start justify-between gap-3 border-b border-border/80 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate font-medium text-[13px] leading-none">
              {title}
            </div>
            {statusVariant[status] ? (
              <Badge variant={statusVariant[status]}>
                {customStatusLabel ?? statusLabel[status]}
              </Badge>
            ) : null}
          </div>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        {headerActions ? (
          <div className="flex items-center gap-1.5">{headerActions}</div>
        ) : null}
      </div>

      {meta ? (
        <div className="flex flex-wrap gap-1.5 border-b border-border/70 px-4 py-2 text-xs text-muted-foreground">
          {meta}
        </div>
      ) : null}

      <div className="px-4 py-3">{children}</div>

      {footer ? (
        <div className="border-t border-border/80 px-4 py-3">{footer}</div>
      ) : null}
    </div>
  );
}
