'use client';

import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';

interface TopbarBreadcrumbsProps {
  /** Override the first segment label (e.g. "Admin" when no BrandProvider) */
  rootLabel?: string;
}

/**
 * TopbarBreadcrumbs — compact topbar breadcrumbs.
 * Reads group + page from SidebarNavigationContext.
 * Format: Group / Page
 */
export default function TopbarBreadcrumbs({
  rootLabel,
}: TopbarBreadcrumbsProps) {
  const { activeGroupId, activePageLabel, exitNestedGroup } =
    useSidebarNavigation();

  const groupLabel = rootLabel || activeGroupId;

  if (!groupLabel && !activePageLabel) {
    return null;
  }

  return (
    <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
      {groupLabel && activePageLabel ? (
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={exitNestedGroup}
          className={cn(
            'hidden sm:inline text-foreground/50 hover:text-foreground/80 transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:rounded-sm',
          )}
        >
          {groupLabel}
        </Button>
      ) : groupLabel ? (
        <span className="text-foreground/70 font-medium truncate max-w-truncate-lg">
          {groupLabel}
        </span>
      ) : null}

      {groupLabel && activePageLabel && (
        <span
          aria-hidden="true"
          className="hidden sm:inline text-foreground/30 select-none"
        >
          /
        </span>
      )}

      {activePageLabel && (
        <span className="text-foreground/70 font-medium truncate max-w-truncate-lg">
          {activePageLabel}
        </span>
      )}
    </nav>
  );
}
