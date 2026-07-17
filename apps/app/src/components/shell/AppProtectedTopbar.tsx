'use client';

import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/constants';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationId,
  getBrandOrganizationSlug,
} from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IBrand } from '@genfeedai/interfaces';
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
import { HiBars3, HiXMark } from 'react-icons/hi2';
import CloudSyncIndicator from '@/components/cloud-sync-indicator/CloudSyncIndicator';
import {
  appendSearchParamsToHref,
  getBrandSwitchHref,
  pickOperatorTaskContextSearchParams,
} from '@/lib/navigation/operator-shell';
import { resolveWorkspaceSurfaceLaunch } from '@/lib/workspace-shell/workspace-surface-launcher';

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

type AppProtectedTopbarChrome = 'app' | 'admin';

type AppProtectedTopbarProps = TopbarProps & {
  chrome?: AppProtectedTopbarChrome;
};

function resolveTopbarScope({
  brandId,
  brandSlug,
  brands,
  orgSlug,
  resolvedBrandSlug,
  resolvedOrgSlug,
  selectedBrand,
}: {
  brandId?: string;
  brandSlug?: string;
  brands: IBrand[];
  orgSlug?: string;
  resolvedBrandSlug?: string;
  resolvedOrgSlug?: string;
  selectedBrand?: IBrand | null;
}) {
  const explicitBrandSlug = brandSlug || undefined;
  const hasExplicitOrgScope = Boolean(orgSlug);
  const effectiveOrgSlug = orgSlug || resolvedOrgSlug;
  const effectiveBrandSlug = hasExplicitOrgScope
    ? explicitBrandSlug
    : (explicitBrandSlug ?? resolvedBrandSlug) || undefined;
  const isOrganizationScopeRoute = hasExplicitOrgScope && !explicitBrandSlug;
  const effectiveBrandId = brandId || getBrandEntityId(selectedBrand);
  const visibleBrandId = isOrganizationScopeRoute ? '' : effectiveBrandId;
  const selectedBrandForContext = effectiveBrandId
    ? brands.find((brand) => getBrandEntityId(brand) === effectiveBrandId) ||
      selectedBrand
    : undefined;
  const brandAwareAppSlug =
    effectiveBrandSlug || selectedBrandForContext?.slug || undefined;

  return {
    brandAwareAppSlug,
    effectiveBrandSlug,
    effectiveOrgSlug,
    isOrganizationScopeRoute,
    visibleBrandId,
  };
}

function AppProtectedTopbarContent({
  chrome = 'app',
  isMenuOpen,
  onMenuToggle,
  isSidebarCollapsed,
  currentApp,
  orgSlug,
  brandSlug,
}: AppProtectedTopbarProps = {}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  // Settings routes (/:org/~/settings or /:org/:brand/settings) show
  // "Settings" as the breadcrumb root. Inspect the app-route segment so a
  // brand slug named "settings" cannot trigger the settings breadcrumb.
  const isSettingsRoute =
    pathname?.split('/').filter(Boolean)[2] === 'settings';
  const { push } = useRouter();
  const { brandId, brands, selectedBrand, setBrandId, setOrganizationId } =
    useBrand();
  const { isAssetGateLocked, isSuperAdmin } = useAccessState();
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
  const {
    brandAwareAppSlug,
    effectiveBrandSlug,
    effectiveOrgSlug,
    isOrganizationScopeRoute,
    visibleBrandId,
  } = resolveTopbarScope({
    brandId,
    brandSlug,
    brands,
    orgSlug,
    resolvedBrandSlug,
    resolvedOrgSlug,
    selectedBrand,
  });
  const isOrganizationSettingsRoute =
    Boolean(effectiveOrgSlug) &&
    isOrganizationScopeRoute &&
    pathname.startsWith(`/${effectiveOrgSlug}/~/settings`);

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
          isOrganizationScopeRoute
            ? createBrandAppRoute(
                nextOrgSlug,
                nextBrand.slug,
                APP_ROUTES.WORKSPACE.OVERVIEW,
              )
            : getBrandSwitchHref({
                nextBrandSlug: nextBrand.slug,
                nextOrgSlug,
                pathname,
              }),
        );
      }
    },
    [
      brands,
      effectiveOrgSlug,
      isOrganizationScopeRoute,
      pathname,
      push,
      setBrandId,
      setOrganizationId,
    ],
  );

  const handleClearBrandSelection = useCallback(() => {
    setBrandId('');

    if (effectiveOrgSlug) {
      push(createOrganizationAppRoute(effectiveOrgSlug, '/overview'));
    }
  }, [effectiveOrgSlug, push, setBrandId]);

  const taskId = searchParams.get('taskId');
  const taskTitle = searchParams.get('taskTitle');
  const currentHref = appendSearchParamsToHref(
    pathname,
    new URLSearchParams(searchParams.toString()),
  );
  const preservedTaskSearch = pickOperatorTaskContextSearchParams(
    new URLSearchParams(searchParams.toString()),
  ).toString();
  const resolveAppSwitcherNavigation = useCallback(
    (destinationHref: string) => {
      const launch = resolveWorkspaceSurfaceLaunch({
        currentHref,
        destinationHref,
        threadId: searchParams.get('thread'),
      });

      return {
        announcement: launch.announcement,
        href: launch.href,
      };
    },
    [currentHref, searchParams],
  );
  const ToggleIcon = isMenuOpen ? HiXMark : HiBars3;
  const isAdminChrome = chrome === 'admin';
  const effectiveCurrentApp = isAdminChrome
    ? 'admin'
    : (currentApp ?? 'workspace');
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
      {/* Brand trigger has px-2 internally; collapsed sidebar leaves room for the fixed logo toggle. */}
      <div
        data-testid="app-protected-topbar-inner"
        className={`grid h-full w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 pr-6 ${
          isSidebarCollapsed ? 'pl-14' : 'pl-4'
        }`}
      >
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

          {!isAdminChrome &&
          brands.length > 0 &&
          !isOrganizationSettingsRoute ? (
            <div className="w-36 min-w-0 sm:w-44 md:w-48">
              <MenuBrandSwitcher
                variant="labeled"
                brands={brands}
                brandId={visibleBrandId}
                onBrandChange={handleBrandChange}
                clearSelectionAction={
                  visibleBrandId
                    ? {
                        ariaLabel: 'Clear brand selection',
                        onSelect: handleClearBrandSelection,
                      }
                    : undefined
                }
              />
            </div>
          ) : null}
        </div>

        <div className="hidden min-w-0 justify-center md:flex">
          <TopbarBreadcrumbs
            fallbackRootLabel={
              TOPBAR_BREADCRUMB_ROOT_LABELS[effectiveCurrentApp]
            }
            rootLabel={isSettingsRoute ? 'Settings' : undefined}
          />
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
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

          {!isAdminChrome ? <TopbarCreditsBar /> : null}

          {!isAdminChrome ? <CloudSyncIndicator /> : null}

          {/* Grouped account controls: section switcher sits directly beside
              the settings/user menu so they read as one cluster. */}
          <div className="flex items-center gap-2">
            {effectiveOrgSlug ? (
              <AppSwitcher
                variant="icon"
                currentApp={effectiveCurrentApp}
                currentPath={pathname}
                orgSlug={effectiveOrgSlug}
                brandAwareSlug={brandAwareAppSlug}
                brandSlug={effectiveBrandSlug}
                isAssetGateLocked={isAssetGateLocked}
                preservedSearch={preservedTaskSearch || undefined}
                resolveNavigation={resolveAppSwitcherNavigation}
                showAdmin={isAdminChrome || isSuperAdmin}
              />
            ) : null}

            {!isAdminChrome ? <TopbarEnd /> : null}
          </div>
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
