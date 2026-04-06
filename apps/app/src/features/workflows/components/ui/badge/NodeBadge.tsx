'use client';

import { cn } from '@helpers/formatting/cn/cn.util';

type BadgeVariant = 'purple' | 'blue' | 'orange' | 'green' | 'red' | 'yellow';

interface NodeBadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  orange:
    'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  purple:
    'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  yellow:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
};

/**
 * Standardized badge component for workflow node headers
 */
export function NodeBadge({
  variant,
  children,
  className,
}: NodeBadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'text-xs px-2 py-0.5 rounded-full flex items-center gap-1',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
