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
 * - Controls keep one order: refresh, download, dropdowns, primary CTA.
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
  primaryAction,
  children,
}: AdminPageShellProps) {
  const hasLeading = Boolean(search) || Boolean(filters);
  const hasRight = Boolean(dropdowns) || Boolean(primaryAction);

  return (
    <Container
      label={title}
      icon={icon}
      titleVisibility="sr-only"
      moduleChrome
      isTopbarPinned
      headerTabs={tabs}
      leading={
        hasLeading ? (
          <div className="flex flex-wrap items-center gap-2">
            {search}
            {filters}
          </div>
        ) : undefined
      }
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
            {primaryAction}
          </>
        ) : undefined
      }
    >
      {children}
    </Container>
  );
}
