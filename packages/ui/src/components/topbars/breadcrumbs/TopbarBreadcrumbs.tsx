'use client';

import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

interface TopbarBreadcrumbsProps {
  /** Used when the active sidebar item has no group (e.g. workspace root nav). */
  fallbackRootLabel?: string;
  /** Override the first segment label (e.g. "Admin" when no BrandProvider) */
  rootLabel?: string;
}

/**
 * TopbarBreadcrumbs — compact topbar breadcrumbs.
 * Reads group + page from SidebarNavigationContext.
 * Format: Group / Page (optional parent in the middle).
 * Root/parent segments become links when the registry supplies hrefs.
 */
export default function TopbarBreadcrumbs({
  fallbackRootLabel,
  rootLabel,
}: TopbarBreadcrumbsProps) {
  const {
    activeGroupId,
    breadcrumbPageLabel,
    breadcrumbParentHref,
    breadcrumbParentLabel,
    breadcrumbRootHref,
    breadcrumbRootLabel,
    exitNestedGroup,
    nestedGroupId,
  } = useSidebarNavigation();
  const { href } = useOrgUrl();

  const groupLabel = rootLabel || breadcrumbRootLabel || fallbackRootLabel;
  const canExitNestedGroup = Boolean(
    activeGroupId && breadcrumbPageLabel && nestedGroupId,
  );
  const rootLinkHref = breadcrumbRootHref
    ? href(breadcrumbRootHref)
    : undefined;
  const parentLinkHref = breadcrumbParentHref
    ? href(breadcrumbParentHref)
    : undefined;

  if (!groupLabel && !breadcrumbParentLabel && !breadcrumbPageLabel) {
    return null;
  }

  const segmentClass =
    'max-w-truncate-lg truncate font-semibold text-foreground/50';
  const linkClass = cn(
    segmentClass,
    'transition-colors duration-150 hover:text-foreground/80',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:rounded-sm',
  );

  return (
    <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
      {groupLabel && breadcrumbPageLabel && canExitNestedGroup ? (
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={exitNestedGroup}
          className={cn(
            'font-medium text-foreground/50 transition-colors duration-150 hover:text-foreground/80',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:rounded-sm',
          )}
        >
          {groupLabel}
        </Button>
      ) : groupLabel && rootLinkHref ? (
        <Link href={rootLinkHref} className={linkClass}>
          {groupLabel}
        </Link>
      ) : groupLabel ? (
        <span className={segmentClass}>{groupLabel}</span>
      ) : null}

      {groupLabel && (breadcrumbParentLabel || breadcrumbPageLabel) ? (
        <span aria-hidden="true" className="select-none text-foreground/30">
          /
        </span>
      ) : null}

      {breadcrumbParentLabel ? (
        <>
          {parentLinkHref ? (
            <Link href={parentLinkHref} className={linkClass}>
              {breadcrumbParentLabel}
            </Link>
          ) : (
            <span className={segmentClass}>{breadcrumbParentLabel}</span>
          )}
          {breadcrumbPageLabel ? (
            <span aria-hidden="true" className="select-none text-foreground/30">
              /
            </span>
          ) : null}
        </>
      ) : null}

      {breadcrumbPageLabel ? (
        <span className="max-w-truncate-lg truncate font-semibold text-foreground">
          {breadcrumbPageLabel}
        </span>
      ) : null}
    </nav>
  );
}
