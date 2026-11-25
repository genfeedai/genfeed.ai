import type { AppsMenuRowProps } from '@/props/ui/apps-menu.props';

/**
 * One row of the topbar Apps menu: an icon, a title with a subtitle, and the
 * row's one action. Rows that carry more (the CLI command) put it underneath.
 */
export default function AppsMenuRow({
  action,
  badge,
  children,
  icon: Icon,
  subtitle,
  testId,
  title,
}: AppsMenuRowProps) {
  return (
    <div className="flex flex-col gap-3 p-3" data-testid={testId}>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tertiary">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            {title}
            {badge}
          </p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {children}
    </div>
  );
}
