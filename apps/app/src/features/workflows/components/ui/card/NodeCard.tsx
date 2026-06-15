'use client';

import { cn } from '@helpers/formatting/cn/cn.util';

interface NodeCardProps {
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
}

/**
 * Standardized card container for workflow nodes
 */
export function NodeCard({
  children,
  className,
  minWidth = '280px',
}: NodeCardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'space-y-3 border border-[var(--border)] bg-card p-4',
        className,
      )}
      style={{ minWidth }}
    >
      {children}
    </div>
  );
}
