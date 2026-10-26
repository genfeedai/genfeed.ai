'use client';

import type { AdminPageShellProps } from '@props/admin/admin-page-shell.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';

/**
 * The one layout every admin page renders through.
 *
 * - The breadcrumb is the page title, so the title is screen-reader only and
 *   no header is drawn inside the content.
 * - Filters live in the subbar, never in the content.
 * - Controls keep one order: refresh, download, dropdowns, Filters menu,
 *   views, primary CTA. Search rests as an icon on the left.
 */
export default function AdminPageShell({
  title,
  icon,
  search,
  filters,
  tabs,
  onRefresh,
  isRefreshing = false,
  download,
  dropdowns,
  views,
  primaryAction,
  children,
}: AdminPageShellProps) {
  const hasRight =
    Boolean(dropdowns) ||
    Boolean(filters) ||
    Boolean(views) ||
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
      iconActions={download}
      right={
        hasRight ? (
          <>
            {dropdowns}
            {filters}
            {views}
            {primaryAction}
          </>
        ) : undefined
      }
    >
      {children}
    </Container>
  );
}
