'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationId,
  getBrandOrganizationSlug,
} from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TopbarProps } from '@props/navigation/topbar.props';
import MenuBrandSwitcher from '@ui/menus/switchers/MenuBrandSwitcher';
import { Button } from '@ui/primitives/button';
import { AppSwitcher } from '@ui/shell/app-switcher/AppSwitcher';
import TopbarBreadcrumbs from '@ui/topbars/breadcrumbs/TopbarBreadcrumbs';
import TopbarCreditsBar from '@ui/topbars/credits-bar/TopbarCreditsBar';
import TopbarEnd from '@ui/topbars/end/TopbarEnd';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';
import { HiBars3, HiOutlineCommandLine, HiXMark } from 'react-icons/hi2';
import { PiSidebarSimple } from 'react-icons/pi';
import CloudSyncIndicator from '@/components/cloud-sync-indicator/CloudSyncIndicator';
import { isHostedCloudApp } from '@/lib/config/edition';
import {
  appendSearchParamsToHref,
  getBrandSwitchHref,
} from '@/lib/navigation/operator-shell';

const TOPBAR_BREADCRUMB_ROOT_LABELS: Record<
  NonNullable<TopbarProps['currentApp']>,
  string
> = {
  admin: 'Admin',
  agent: 'Agent',
  analytics: 'Analytics',
  compose: 'Compose',
  editor: 'Editor',
  library: 'Library',
  messages: 'Messages',
  posts: 'Posts',
  remix: 'Remix',
  research: 'Research',
  studio: 'Studio',
  workflows: 'Workflows',
  workspace: 'Workspace',
};

function AppProtectedTopbarContent({
  isMenuOpen,
  onMenuToggle,
  isSidebarCollapsed,
  onSidebarToggle,
  isAgentCollapsed,
  onAgentToggle,
  currentApp,
  orgSlug,
  brandSlug,
}: TopbarProps = {}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { push } = useRouter();
  const { brandId, brands, selectedBrand, setBrandId, setOrganizationId } =
    useBrand();
  const { isSuperAdmin } = useAccessState();
  // Route props are authoritative; only fall back to useOrgUrl when the shell is
  // rendered without route context. On org-level `/:org/~/...` pages
  // effectiveBrandSlug stays undefined so the app switcher links into org-scoped
  // views instead of trapping a stale brand. The brand context (brandId/brands)
  // still drives the brand switcher itself.
  const {
    href,
    brandSlug: resolvedBrandSlug,
    orgSlug: resolvedOrgSlug,
  } = useOrgUrl();
  const explicitBrandSlug = brandSlug || undefined;
  const hasExplicitOrgScope = Boolean(orgSlug);
  const effectiveOrgSlug = orgSlug || resolvedOrgSlug;
  const effectiveBrandSlug = hasExplicitOrgScope
    ? explicitBrandSlug
    : (explicitBrandSlug ?? resolvedBrandSlug) || undefined;
  const effectiveBrandId = brandId || getBrandEntityId(selectedBrand);

  const handleBrandChange = useCallback(
    (nextBrandId: string) => {
      setBrandId(nextBrandId);

      const nextBrand = brands.find(
        (brand) => getBrandEntityId(brand) === nextBrandId,
      );
      const nextOrganizationId = getBrandOrganizationId(nextBrand);
      const nextOrgSlug =
        getBrandOrganizationSlug(nextBrand) || effectiveOrgSlug;

      if (nextOrganizationId) {
        setOrganizationId(nextOrganizationId);
      }

      if (nextOrgSlug && nextBrand?.slug) {
        push(
          getBrandSwitchHref({
            nextBrandSlug: nextBrand.slug,
            nextOrgSlug,
            pathname,
          }),
        );
      }
    },
    [brands, effectiveOrgSlug, pathname, push, setBrandId, setOrganizationId],
  );

  const taskId = searchParams.get('taskId');
  const taskTitle = searchParams.get('taskTitle');
  const ToggleIcon = isMenuOpen ? HiXMark : HiBars3;
  const shouldRenderAgentToggle =
    Boolean(onAgentToggle) &&
    (process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1' || !isHostedCloudApp());
  const backToTaskHref = taskId
    ? href(
        appendSearchParamsToHref(
          APP_ROUTES.WORKSPACE.OVERVIEW,
          new URLSearchParams([['taskId', taskId]]),
        ),
      )
    : null;

  return (
    <header className="ship-ui h-full w-full bg-transparent">
      <div className="grid h-full w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 pl-3 pr-2 sm:px-4 lg:px-5">
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          {onMenuToggle ? (
            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              className="size-7 md:hidden"
              data-active={isMenuOpen ? 'true' : 'false'}
              ariaLabel={
                isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'
              }
              onClick={onMenuToggle}
            >
              <ToggleIcon className="size-5" />
            </Button>
          ) : null}

          {isSidebarCollapsed && onSidebarToggle ? (
            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              className="hidden size-7 md:flex"
              ariaLabel="Expand sidebar"
              onClick={onSidebarToggle}
            >
              <PiSidebarSimple className="size-4" />
            </Button>
          ) : null}

          {brands.length > 0 ? (
            <div className="w-36 min-w-0 sm:w-44 md:w-48">
              <MenuBrandSwitcher
                variant="labeled"
                brands={brands}
                brandId={effectiveBrandId}
                onBrandChange={handleBrandChange}
              />
            </div>
          ) : null}
        </div>

        <div className="hidden min-w-0 justify-center md:flex">
          <TopbarBreadcrumbs
            fallbackRootLabel={
              TOPBAR_BREADCRUMB_ROOT_LABELS[currentApp ?? 'workspace']
            }
          />
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1.5">
          {taskId ? (
            <div className="hidden items-center gap-2 rounded border border-border bg-background-secondary px-2 py-1 text-[11px] lg:flex">
              <span className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Task context
              </span>
              {taskTitle ? (
                <span className="max-w-[18rem] truncate text-foreground/75">
                  {taskTitle}
                </span>
              ) : null}
              {backToTaskHref ? (
                <Link
                  href={backToTaskHref}
                  className="font-semibold text-foreground hover:text-foreground/80"
                >
                  Back to task
                </Link>
              ) : null}
            </div>
          ) : null}

          {shouldRenderAgentToggle ? (
            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              className="size-7"
              data-active={isAgentCollapsed ? 'false' : 'true'}
              ariaLabel={
                isAgentCollapsed ? 'Open terminal dock' : 'Close terminal dock'
              }
              onClick={onAgentToggle}
            >
              <HiOutlineCommandLine className="size-4" />
            </Button>
          ) : null}

          <CloudSyncIndicator />

          {/* Grouped account controls: section switcher sits directly beside
              the settings/user menu so they read as one cluster. */}
          <div className="flex items-center gap-0.5">
            {effectiveOrgSlug ? (
              <AppSwitcher
                variant="icon"
                currentApp={currentApp ?? 'workspace'}
                currentPath={pathname}
                orgSlug={effectiveOrgSlug}
                brandSlug={effectiveBrandSlug}
                showAdmin={isSuperAdmin}
              />
            ) : null}

            <TopbarEnd />
          </div>

          <TopbarCreditsBar />
        </div>
      </div>
    </header>
  );
}

export default function AppProtectedTopbar(
  props: Parameters<typeof AppProtectedTopbarContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <AppProtectedTopbarContent {...props} />
    </Suspense>
  );
}
