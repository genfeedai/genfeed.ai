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
    <nav
      className="flex items-center gap-1.5 text-[13px]"
      aria-label="Breadcrumb"
    >
      {groupLabel && activePageLabel ? (
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
        <span className="text-foreground font-semibold truncate max-w-truncate-lg">
          {groupLabel}
        </span>
      ) : null}

      {groupLabel && activePageLabel && (
        <span aria-hidden="true" className="text-foreground/30 select-none">
          /
        </span>
      )}

      {activePageLabel && (
        <span className="truncate max-w-truncate-lg text-foreground font-semibold">
          {activePageLabel}
        </span>
      )}
    </nav>
  );
}
