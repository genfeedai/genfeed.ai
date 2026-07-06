import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
        'rounded-xl p-4',
        isWarning
          ? 'border border-amber-500/30 bg-amber-500/10'
          : 'shadow-border bg-secondary/30',
        className,
      )}
    >
      {(Icon || title) && (
        <div className="flex items-start gap-3">
          {Icon && (
            <Icon
              className={cn(
                'size-5 shrink-0 mt-0.5',
                isWarning ? 'text-amber-500' : 'text-muted-foreground',
              )}
            />
          )}
          <div>
            {title && (
              <h4
                className={cn(
                  'font-medium text-sm',
                  isWarning
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-foreground',
                )}
              >
                {title}
              </h4>
            )}
            <div
              className={cn(
                'text-sm',
                title && 'mt-1',
                isWarning
                  ? 'text-amber-600/80 dark:text-amber-400/80'
                  : 'text-muted-foreground',
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

export default InfoBox;
