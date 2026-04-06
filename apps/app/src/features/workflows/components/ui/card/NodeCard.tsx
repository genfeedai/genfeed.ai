'use client';

import { cn } from '@helpers/formatting/cn/cn.util';

interface NodeCardProps {
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
}

interface NodeHeaderProps {
  icon?: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
}

interface NodeDescriptionProps {
  children: React.ReactNode;
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

/**
 * Standardized header for workflow nodes
 */
export function NodeHeader({
  icon,
  title,
  badge,
}: NodeHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {badge}
    </div>
  );
}

/**
 * Standardized description text for workflow nodes
 */
export function NodeDescription({
  children,
}: NodeDescriptionProps): React.JSX.Element {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
