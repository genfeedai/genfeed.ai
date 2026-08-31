'use client';

import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { SectionTopbarProps } from '@genfeedai/props/ui/layout/section-topbar.props';

/**
 * SectionTopbar — the shared sub-topbar for app section pages.
 *
 * **App contract for local navigation + primary actions** (Discovery Socials,
 * Ads hub, Models, Admin list modules, Analytics date tools, etc.):
 * - full-bleed `border-b` that meets the shell edges
 * - tabs left, primary tools right, inside the same bar
 * - when shell breadcrumb owns page identity (or `titleVisibility="sr-only"`):
 *   title is chrome-only; tabs + actions share one dense row
 * - when title is visible: title row, then optional tab strip under it
 *
 * Prefer this over hand-rolled toolbars. Pages may render it directly, or let
 * {@link Container} emit it from `headerTabs` / promoted body `tabs` / `right`.
 */
export default function SectionTopbar({
  title,
  subtitle,
  icon: Icon,
  actions,
  tabs,
  titleVisibility = 'auto',
  className,
}: SectionTopbarProps) {
  const { hasCanonicalBreadcrumb } = useSidebarNavigation();
  const hasVisibleTitle =
    titleVisibility === 'visible'
      ? true
      : titleVisibility === 'sr-only'
        ? false
        : !hasCanonicalBreadcrumb;
  const hasActions = Boolean(actions);
  const hasTabs = Boolean(tabs);

  // Chrome-only title with no tools: do not paint an empty border-b strip.
  if (!hasVisibleTitle && !hasTabs && !hasActions) {
    return (
      <h1 className="sr-only" data-testid="section-topbar">
        {title}
      </h1>
    );
  }

  if (!hasVisibleTitle) {
    return (
      <div
        data-testid="section-topbar"
        className={cn('w-full border-b border-border', className)}
      >
        <h1 className="sr-only">{title}</h1>
        <div
          className={cn(
            'flex w-full items-center gap-3 px-4 py-1.5 sm:px-6',
            !hasTabs && hasActions && 'justify-end',
          )}
        >
          {hasTabs ? (
            <div
              data-testid="section-topbar-tabs"
              className="min-w-0 flex-1 overflow-x-auto scrollbar-thin"
            >
              {tabs}
            </div>
          ) : null}
          {hasActions ? (
            <div
              data-testid="section-topbar-actions"
              className="flex shrink-0 flex-wrap items-center justify-end gap-2"
            >
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="section-topbar"
      className={cn('w-full border-b border-border', className)}
    >
      <div
        className={cn(
          'flex w-full items-center gap-3 px-6 py-2',
          hasActions ? 'justify-between' : 'justify-start',
        )}
      >
        <div className="flex min-w-0 items-baseline gap-2.5">
          <div className="flex items-center gap-2">
            {Icon ? (
              <Icon className="size-4 flex-shrink-0 text-foreground/60" />
            ) : null}
            <h1 className="whitespace-nowrap text-sm font-semibold tracking-tight">
              {title}
            </h1>
          </div>
          {subtitle ? (
            <p className="hidden min-w-0 truncate text-xs text-foreground/55 lg:block">
              {subtitle}
            </p>
          ) : null}
        </div>

        {hasActions ? (
          <div
            data-testid="section-topbar-actions"
            className="flex flex-wrap items-center justify-end gap-2"
          >
            {actions}
          </div>
        ) : null}
      </div>

      {hasTabs ? (
        <div
          data-testid="section-topbar-tabs"
          className="overflow-x-auto px-4 pb-1.5 scrollbar-thin"
        >
          {tabs}
        </div>
      ) : null}
    </div>
  );
}
