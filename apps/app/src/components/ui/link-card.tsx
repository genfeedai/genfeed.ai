import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface LinkCardProps {
  className?: string;
  description?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  /** Large icon style (for prominent cards) */
  prominent?: boolean;
  trailingIcon?: ReactNode;
}

/** Clickable external link card */
export function LinkCard({
  className,
  description,
  href,
  icon: Icon,
  title,
  prominent,
  trailingIcon,
}: LinkCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-3 rounded-card border border-border transition hover:border-primary/50 hover:bg-secondary/30',
        prominent ? 'p-4' : 'p-3',
        className,
      )}
    >
      {prominent ? (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Icon className="size-5 text-primary" />
        </div>
      ) : (
        <Icon className="size-5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{title}</div>
        {description ? (
          <p
            className={cn(
              prominent ? 'text-sm' : 'text-xs',
              'text-muted-foreground',
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {trailingIcon}
    </a>
  );
}

export default LinkCard;
