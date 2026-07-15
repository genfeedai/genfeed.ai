'use client';

import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';

interface TopbarBreadcrumbsProps {
  /** Used when the active sidebar item has no group (e.g. workspace root nav). */
  fallbackRootLabel?: string;
  /** Override the first segment label (e.g. "Admin" when no BrandProvider) */
  rootLabel?: string;
}

/**
 * TopbarBreadcrumbs — compact topbar breadcrumbs.
 * Reads group + page from SidebarNavigationContext.
 * Format: Group / Page
 */
export default function TopbarBreadcrumbs({
  fallbackRootLabel,
  rootLabel,
}: TopbarBreadcrumbsProps) {
  const {
    activeGroupId,
    breadcrumbPageLabel,
    breadcrumbRootLabel,
    exitNestedGroup,
    nestedGroupId,
  } = useSidebarNavigation();

  const groupLabel = rootLabel || breadcrumbRootLabel || fallbackRootLabel;
  const canExitNestedGroup = Boolean(
    activeGroupId && breadcrumbPageLabel && nestedGroupId,
  );

  if (!groupLabel && !breadcrumbPageLabel) {
    return null;
  }

  return (
    <nav
      className="flex items-center gap-1.5 text-[13px]"
      aria-label="Breadcrumb"
    >
      {groupLabel && breadcrumbPageLabel && canExitNestedGroup ? (
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={exitNestedGroup}
          className={cn(
            'text-foreground/50 hover:text-foreground/80 transition-colors duration-150 font-medium',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:rounded-sm',
          )}
        >
          {groupLabel}
        </Button>
      ) : groupLabel ? (
        <span className="max-w-truncate-lg truncate font-semibold text-foreground/50">
          {groupLabel}
        </span>
      ) : null}

      {groupLabel && breadcrumbPageLabel && (
        <span aria-hidden="true" className="text-foreground/30 select-none">
          /
        </span>
      )}

      {breadcrumbPageLabel && (
        <span className="truncate max-w-truncate-lg text-foreground font-semibold">
          {breadcrumbPageLabel}
        </span>
      )}
    </nav>
  );
}
