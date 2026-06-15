import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type { InfoBoxProps } from './info-box';
export { InfoBox } from './info-box';

export type { LinkCardProps } from './link-card';
export { LinkCard } from './link-card';

/* ─── SettingsField ─── */

export interface SettingsFieldProps {
  label: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Right-side control (toggle, select, etc.) */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** A label + description row with optional action on the right */
export function SettingsField({
  label,
  description,
  icon: Icon,
  action,
  children,
  className,
}: SettingsFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            {Icon && <Icon className="size-4" />}
            {label}
          </label>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
