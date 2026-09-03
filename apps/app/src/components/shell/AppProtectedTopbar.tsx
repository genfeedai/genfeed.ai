'use client';

import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationId,
  getBrandOrganizationSlug,
} from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_DISPLAY_LABELS,
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TopbarProps } from '@props/navigation/topbar.props';
import SidebarLogoToggleButton from '@ui/menus/sidebar-logo-toggle/SidebarLogoToggleButton';
import MenuBrandSwitcher from '@ui/menus/switchers/MenuBrandSwitcher';
import { Button } from '@ui/primitives/button';
import { AppSwitcher } from '@ui/shell/app-switcher/AppSwitcher';
import TopbarBreadcrumbs from '@ui/topbars/breadcrumbs/TopbarBreadcrumbs';
import TopbarCreditsBar from '@ui/topbars/credits-bar/TopbarCreditsBar';
import { Menu, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';

import CloudSyncIndicator from '@/components/cloud-sync-indicator/CloudSyncIndicator';
import TopbarActivityMenu from '@/components/shell/TopbarActivityMenu';
import { useWorkspaceInspector } from '@/components/workspace-shell/WorkspaceInspectorContext';
import {
  appendSearchParamsToHref,
  getBrandSwitchHref,
  getCurrentBrandScopedPath,
  pickOperatorTaskContextSearchParams,
  resolveOrganizationScopePath,
} from '@/lib/navigation/operator-shell';
import { resolveWorkspaceSurfaceLaunch } from '@/lib/workspace-shell/workspace-surface-launcher';

const TOPBAR_BREADCRUMB_ROOT_LABELS: Record<
  NonNullable<TopbarProps['currentApp']>,
  string
> = {
  admin: APP_DISPLAY_LABELS.admin,
  agent: APP_DISPLAY_LABELS.agent,
  analytics: APP_DISPLAY_LABELS.analytics,
  automation: APP_DISPLAY_LABELS.automation,
  library: APP_DISPLAY_LABELS.library,
  messages: APP_DISPLAY_LABELS.messages,
  publishing: APP_DISPLAY_LABELS.publishing,
  discovery: APP_DISPLAY_LABELS.discovery,
  studio: APP_DISPLAY_LABELS.studio,
  workspace: APP_DISPLAY_LABELS.workspace,
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
  onSidebarToggle,
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
  const workspaceInspector = useWorkspaceInspector();
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
        // Stay on the surface (agent, studio, …) but drop a selected
        // conversation — that thread belongs to the previous brand.
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

  const handleClearBrandSelection = useCallback(() => {
    setBrandId('');

    if (effectiveOrgSlug) {
      // Drop brand scope. Shared surfaces keep the same path under `~`;
      // brand-only settings (publishing, voice, …) fall back to org brands
      // instead of a 404 on /:org/~/settings/publishing.
      push(
        createOrganizationAppRoute(
          effectiveOrgSlug,
          resolveOrganizationScopePath(getCurrentBrandScopedPath(pathname)),
        ),
      );
    }
  }, [effectiveOrgSlug, pathname, push, setBrandId]);

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
  const ToggleIcon = isMenuOpen ? X : Menu;
  const isAdminChrome = chrome === 'admin';
  // Breadcrumb fallback label only (switcher active state is path-based).
  const breadcrumbFallbackApp = isAdminChrome
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
    <header className="h-full w-full bg-transparent">
      {/* Match sidebar header: h-12 content band, px-3 horizontal, gap-1.5 between controls. */}
      <div
        data-testid="app-protected-topbar-inner"
        className="grid h-full w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3"
      >
        <div className="flex min-w-0 items-center gap-1.5 justify-self-start">
          {onSidebarToggle && isSidebarCollapsed ? (
            <SidebarLogoToggleButton
              ariaLabel="Expand sidebar"
              className="hidden md:flex"
              direction="expand"
              onClick={onSidebarToggle}
            />
          ) : null}

          {onMenuToggle ? (
            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              className="size-8 md:hidden"
              data-active={isMenuOpen ? 'true' : 'false'}
              ariaLabel={
                isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'
              }
              onClick={onMenuToggle}
            >
              <ToggleIcon className="size-4" />
            </Button>
          ) : null}

          {!isAdminChrome &&
          brands.length > 0 &&
          !isOrganizationSettingsRoute ? (
            <div className="w-40 min-w-0 sm:w-44 md:w-48">
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
              TOPBAR_BREADCRUMB_ROOT_LABELS[breadcrumbFallbackApp]
            }
            rootLabel={isSettingsRoute ? 'Settings' : undefined}
          />
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1.5">
          {taskId ? (
            <div className="hidden items-center gap-2 rounded border border-border bg-background-secondary px-2 py-1 text-2xs lg:flex">
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

          {!isAdminChrome ? <TopbarActivityMenu /> : null}

          {!isAdminChrome ? <CloudSyncIndicator /> : null}

          {effectiveOrgSlug ? (
            <AppSwitcher
              variant="icon"
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

          {/* Last control in the bar, always: the inspector's only opener
              lives here — and pinning it to the extreme right means it never
              shifts between states. At `xl` and up it collapses/expands the
              rail; below `xl` the rail is display:none, so the same slot
              swaps to a variant that opens the inspector drawer instead. */}
          {workspaceInspector?.isRegistered ? (
            <>
              <Button
                aria-controls="workspace-context-inspector"
                aria-expanded={workspaceInspector.isOpen}
                type="button"
                variant={ButtonVariant.GHOST}
                size={ButtonSize.ICON}
                className="hidden size-8 xl:inline-flex"
                data-active={workspaceInspector.isOpen ? 'true' : 'false'}
                data-testid="topbar-inspector-toggle"
                ariaLabel={
                  workspaceInspector.isOpen
                    ? 'Collapse workspace inspector'
                    : 'Expand workspace inspector'
                }
                onClick={workspaceInspector.toggle}
              >
                {workspaceInspector.isOpen ? (
                  <PanelRightClose className="size-4" />
                ) : (
                  <PanelRightOpen className="size-4" />
                )}
              </Button>
              <Button
                aria-controls="workspace-context-inspector-drawer"
                aria-expanded={workspaceInspector.isMobileOpen}
                type="button"
                variant={ButtonVariant.GHOST}
                size={ButtonSize.ICON}
                className="inline-flex size-8 xl:hidden"
                data-testid="topbar-inspector-drawer-toggle"
                ariaLabel={
                  workspaceInspector.isMobileOpen
                    ? 'Close workspace inspector'
                    : 'Open workspace inspector'
                }
                onClick={() =>
                  workspaceInspector.setIsMobileOpen(
                    !workspaceInspector.isMobileOpen,
                  )
                }
              >
                {workspaceInspector.isMobileOpen ? (
                  <PanelRightClose className="size-4" />
                ) : (
                  <PanelRightOpen className="size-4" />
                )}
              </Button>
            </>
          ) : null}
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
