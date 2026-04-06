import type { ComponentType, ReactNode } from 'react';

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

interface ActivityRowProps {
  /** Actor display (avatar + name) */
  actor: ReactNode;
  /** Action verb text (e.g., "commented on", "changed status to") */
  verb: string;
  /** Entity name (e.g., issue identifier "GEN-42") */
  entityName?: string;
  /** Entity title or description */
  entityTitle?: string;
  /** Relative time string (e.g., "3m ago") */
  timeAgo: string;
  /** Link destination */
  href?: string;
  className?: string;
  linkComponent?: ComponentType<{
    href: string;
    className: string;
    children: ReactNode;
  }>;
}

export function ActivityRow({
  actor,
  verb,
  entityName,
  entityTitle,
  timeAgo,
  href,
  className,
  linkComponent: LinkComponent,
}: ActivityRowProps) {
  const inner = (
    <div className="flex gap-3">
      <p className="min-w-0 flex-1 truncate">
        {actor}
        <span className="ml-1 text-muted-foreground">{verb} </span>
        {entityName && <span className="font-medium">{entityName}</span>}
        {entityTitle && (
          <span className="ml-1 text-muted-foreground">— {entityTitle}</span>
        )}
      </p>
      <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
        {timeAgo}
      </span>
    </div>
  );

  const classes = cn(
    'px-4 py-2 text-sm',
    href && 'cursor-pointer transition-colors hover:bg-accent/50',
    className,
  );

  if (href && LinkComponent) {
    return (
      <LinkComponent
        href={href}
        className={cn(classes, 'block text-inherit no-underline')}
      >
        {inner}
      </LinkComponent>
    );
  }

  if (href) {
    return (
      <a href={href} className={cn(classes, 'block text-inherit no-underline')}>
        {inner}
      </a>
    );
  }

  return <div className={classes}>{inner}</div>;
}
