import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

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
            {Icon && <Icon className="h-4 w-4" />}
            {label}
          </label>
          {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ─── InfoBox ─── */

export interface InfoBoxProps {
  variant?: 'default' | 'warning';
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  children: ReactNode;
  className?: string;
}

/** Bordered info/warning box */
export function InfoBox({
  variant = 'default',
  icon: Icon,
  title,
  children,
  className,
}: InfoBoxProps) {
  const isWarning = variant === 'warning';
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        isWarning ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-secondary/30',
        className
      )}
    >
      {(Icon || title) && (
        <div className="flex items-start gap-3">
          {Icon && (
            <Icon
              className={cn(
                'h-5 w-5 shrink-0 mt-0.5',
                isWarning ? 'text-amber-500' : 'text-muted-foreground'
              )}
            />
          )}
          <div>
            {title && (
              <h4
                className={cn(
                  'font-medium text-sm',
                  isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
                )}
              >
                {title}
              </h4>
            )}
            <div
              className={cn(
                'text-sm',
                title && 'mt-1',
                isWarning ? 'text-amber-600/80 dark:text-amber-400/80' : 'text-muted-foreground'
              )}
            >
              {children}
            </div>
          </div>
        </div>
      )}
      {!Icon && !title && children}
    </div>
  );
}

/* ─── LinkCard ─── */

export interface LinkCardProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** Large icon style (for prominent cards) */
  prominent?: boolean;
}

/** Clickable external link card */
export function LinkCard({ href, icon: Icon, title, description, prominent }: LinkCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border transition hover:border-primary/50 hover:bg-secondary/30',
        prominent ? 'p-4' : 'p-3'
      )}
    >
      {prominent ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      ) : (
        <Icon className="h-5 w-5 text-muted-foreground" />
      )}
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <p className={cn(prominent ? 'text-sm' : 'text-xs', 'text-muted-foreground')}>
          {description}
        </p>
      </div>
    </a>
  );
}
