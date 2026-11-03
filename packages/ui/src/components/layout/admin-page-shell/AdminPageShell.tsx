'use client';

import type { AdminPageShellProps } from '@props/admin/admin-page-shell.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import SubbarControls from '@ui/layout/subbar-controls/SubbarControls';

/**
 * The one layout every admin page renders through.
 *
 * - The breadcrumb is the page title, so the title is screen-reader only and
 *   no header is drawn inside the content.
 * - Filters live in the subbar, never in the content.
 * - Controls keep one order: the "..." menu, refresh, then
 *   {@link SubbarControls} (secondary actions, Filters menu, views, date
 *   range, primary CTA).
 *   Search is the persistent search field on the left, with the page's
 *   Filters menu inside it.
 */
export default function AdminPageShell({
  title,
  icon,
  search,
  filters,
  tabs,
  onRefresh,
  isRefreshing = false,
  overflow,
  secondaryActions,
  views,
  dateRange,
  primaryAction,
  children,
}: AdminPageShellProps) {
  const hasRight =
    Boolean(secondaryActions) ||
    Boolean(filters) ||
    Boolean(views) ||
    Boolean(dateRange) ||
    Boolean(primaryAction);

  return (
    <Container
      label={title}
      icon={icon}
      titleVisibility="sr-only"
      moduleChrome
      isTopbarPinned
      headerTabs={tabs}
      leading={search}
      refresh={
        onRefresh ? (
          <ButtonRefresh onClick={onRefresh} isRefreshing={isRefreshing} />
        ) : undefined
      }
      overflow={overflow}
      right={
        hasRight ? (
          <SubbarControls
            secondaryActions={secondaryActions}
            filters={filters}
            views={views}
            dateRange={dateRange}
            primaryAction={primaryAction}
          />
        ) : undefined
      }
    >
      {children}
    </Container>
  );
}
