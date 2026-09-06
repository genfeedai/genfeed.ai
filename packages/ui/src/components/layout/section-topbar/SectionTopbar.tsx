'use client';

import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { SectionTopbarProps } from '@genfeedai/props/ui/layout/section-topbar.props';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * SectionTopbar — the shared sub-topbar for app section pages.
 *
 * **App contract for local navigation + primary actions** (Discovery Socials,
 * Ads hub, Models, Admin list modules, Analytics date tools, etc.):
 * - full-bleed `border-b` that meets the shell edges
 * - primary tools followed by tabs at the right edge, inside the same bar
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
  leading,
  tabs,
  titleVisibility = 'auto',
  help,
  className,
}: SectionTopbarProps) {
  const { hasCanonicalBreadcrumb } = useSidebarNavigation();
  const translate = useTranslations('ui.sectionTopbar');
  const hasVisibleTitle =
    titleVisibility === 'visible'
      ? true
      : titleVisibility === 'sr-only'
        ? false
        : !hasCanonicalBreadcrumb;
  const hasLeading = Boolean(leading);
  const hasTabs = Boolean(tabs);
  const helpTrigger = help ? (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          ariaLabel={translate('help')}
          icon={<CircleHelp className="size-4" />}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          className="shrink-0"
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="max-w-80 text-sm">
        <p className="font-semibold text-foreground">{help.title}</p>
        <div className="mt-1 text-foreground/70">{help.body}</div>
      </PopoverContent>
    </Popover>
  ) : null;
  const hasActions = Boolean(actions) || Boolean(helpTrigger);

  // Chrome-only title with no tools: do not paint an empty border-b strip.
  if (!hasVisibleTitle && !hasLeading && !hasTabs && !hasActions) {
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
            'flex w-full items-center justify-end gap-3 px-4 py-1.5 sm:px-6',
            !hasLeading && !hasTabs && hasActions && 'justify-end',
          )}
        >
          {hasLeading ? (
            <div
              data-testid="section-topbar-leading"
              className="mr-auto flex shrink-0 items-center"
            >
              {leading}
            </div>
          ) : null}
          {hasActions ? (
            <div
              data-testid="section-topbar-actions"
              className={cn(
                'flex items-center gap-2',
                hasTabs
                  ? 'shrink-0 flex-wrap justify-end'
                  : 'min-w-0 flex-1 flex-wrap justify-start',
              )}
            >
              {actions}
              {helpTrigger}
            </div>
          ) : null}
          {hasTabs ? (
            <div
              data-testid="section-topbar-tabs"
              className="min-w-0 max-w-full overflow-x-auto scrollbar-thin"
            >
              {tabs}
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
        <div className="flex min-w-0 items-center gap-3">
          {hasLeading ? (
            <div
              data-testid="section-topbar-leading"
              className="flex shrink-0 items-center"
            >
              {leading}
            </div>
          ) : null}
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
        </div>

        {hasActions ? (
          <div
            data-testid="section-topbar-actions"
            className="flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2"
          >
            {actions}
            {helpTrigger}
          </div>
        ) : null}
      </div>

      {hasTabs ? (
        <div
          data-testid="section-topbar-tabs"
          className="flex justify-end overflow-x-auto px-6 pb-1.5 scrollbar-thin"
        >
          {tabs}
        </div>
      ) : null}
    </div>
  );
}
