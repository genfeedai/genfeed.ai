import type { ComponentType, MouseEvent, ReactNode } from 'react';

interface SidebarNavItemProps {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  isActive?: boolean;
  badge?: number;
  badgeTone?: 'default' | 'danger';
  textBadge?: string;
  textBadgeTone?: 'default' | 'amber';
  alert?: boolean;
  liveCount?: number;
  className?: string;
  onClick?: (e: MouseEvent) => void;
  /** Render prop for custom link wrapper (e.g., Next.js Link, React Router NavLink) */
  linkComponent?: ComponentType<{
    href: string;
    className: string;
    onClick?: (e: MouseEvent) => void;
    children: ReactNode;
  }>;
}

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function SidebarNavItem({
  href,
  label,
  icon: Icon,
  isActive = false,
  badge,
  badgeTone = 'default',
  textBadge,
  textBadgeTone = 'default',
  alert = false,
  liveCount,
  className,
  onClick,
  linkComponent: LinkComponent,
}: SidebarNavItemProps) {
  const classes = cn(
    'flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors',
    isActive
      ? 'bg-accent text-foreground'
      : 'text-foreground/80 hover:bg-accent/50 hover:text-foreground',
    className,
  );

  const content = (
    <>
      <span className="relative shrink-0">
        <Icon className="h-4 w-4" />
        {alert && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_2px_hsl(var(--background))]" />
        )}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {textBadge && (
        <span
          className={cn(
            'ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
            textBadgeTone === 'amber'
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {textBadge}
        </span>
      )}
      {liveCount != null && liveCount > 0 && (
        <span className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
          <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
            {liveCount} live
          </span>
        </span>
      )}
      {badge != null && badge > 0 && (
        <span
          className={cn(
            'ml-auto rounded-full px-1.5 py-0.5 text-xs leading-none',
            badgeTone === 'danger'
              ? 'bg-red-600/90 text-red-50'
              : 'bg-primary text-primary-foreground',
          )}
        >
          {badge}
        </span>
      )}
    </>
  );

  if (LinkComponent) {
    return (
      <LinkComponent href={href} className={classes} onClick={onClick}>
        {content}
      </LinkComponent>
    );
  }

  return (
    <a href={href} className={classes} onClick={onClick}>
      {content}
    </a>
  );
}
