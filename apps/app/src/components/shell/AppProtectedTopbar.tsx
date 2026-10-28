'use client';

import { isPersonalSettingsPage } from '@app-components/app-protected-layout.settings-scope';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_DISPLAY_LABELS } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers';
import type { TopbarProps } from '@props/navigation/topbar.props';
import OrganizationSwitcher from '@ui/menus/organization-switcher/OrganizationSwitcher';
import { Button } from '@ui/primitives/button';
import TopbarBreadcrumbs from '@ui/topbars/breadcrumbs/TopbarBreadcrumbs';
import CreditsLiveSync from '@ui/topbars/credits-bar/CreditsLiveSync';
import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

import CloudSyncIndicator from '@/components/cloud-sync-indicator/CloudSyncIndicator';
import AppProtectedBrandSwitcher from '@/components/shell/AppProtectedBrandSwitcher';
import GenerationToasts from '@/components/shell/GenerationToasts';
import NotificationInboxMenu from '@/components/shell/NotificationInboxMenu';
import TopbarAppsLink from '@/components/shell/TopbarAppsLink';
import TopbarPanelToggles from '@/components/shell/TopbarPanelToggles';

const TOPBAR_BREADCRUMB_ROOT_LABELS: Record<
  NonNullable<TopbarProps['currentApp']>,
  string
> = {
  admin: APP_DISPLAY_LABELS.admin,
  agent: APP_DISPLAY_LABELS.agent,
  analytics: APP_DISPLAY_LABELS.analytics,
  automation: APP_DISPLAY_LABELS.automation,
  clipper: APP_DISPLAY_LABELS.clipper,
  editor: APP_DISPLAY_LABELS.editor,
  library: APP_DISPLAY_LABELS.library,
  messages: APP_DISPLAY_LABELS.messages,
  motion: APP_DISPLAY_LABELS.motion,
  playground: APP_DISPLAY_LABELS.playground,
  publishing: APP_DISPLAY_LABELS.publishing,
  discovery: APP_DISPLAY_LABELS.discovery,
  storyboard: APP_DISPLAY_LABELS.storyboard,
  turbo: APP_DISPLAY_LABELS.turbo,
  workspace: APP_DISPLAY_LABELS.workspace,
};

type AppProtectedTopbarChrome = 'app' | 'admin';

type AppProtectedTopbarProps = TopbarProps & {
  chrome?: AppProtectedTopbarChrome;
};

function AppProtectedTopbarContent({
  brandSlug,
  chrome = 'app',
  currentApp,
  isMenuOpen,
  onMenuToggle,
  orgSlug,
}: AppProtectedTopbarProps = {}) {
  const pathname = usePathname();
  // Settings routes (/:org/~/settings or /:org/:brand/settings) show
  // "Settings" as the breadcrumb root. Inspect the app-route segment so a
  // brand slug named "settings" cannot trigger the settings breadcrumb.
  const isAppsRoute = pathname?.split('/').filter(Boolean)[2] === 'apps';
  const isSettingsRoute =
    pathname?.split('/').filter(Boolean)[2] === 'settings';
  const { settings } = useBrand();
  const translateApps = useTranslations('common.apps');

  const ToggleIcon = isMenuOpen ? X : Menu;
  const isAdminChrome = chrome === 'admin';
  // Breadcrumb fallback label only (the app rail's active state is path-based).
  const breadcrumbFallbackApp = isAdminChrome
    ? 'admin'
    : (currentApp ?? 'workspace');
  return (
    <header className="h-full w-full bg-transparent">
      {/* Leading edge, one height: organization, brand, then the breadcrumb.
          The Genfeed mark lives in the rail. Every control is h-8. */}
      <div
        data-testid="app-protected-topbar-inner"
        className="flex h-full w-full items-center gap-1 px-2 md:gap-3 md:px-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 md:gap-1.5">
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
              withWrapper={false}
            >
              <ToggleIcon className="size-4" />
            </Button>
          ) : null}

          <div className="flex min-w-0 items-center gap-1 md:gap-1.5">
            {isAdminChrome || isPersonalSettingsPage(pathname) ? null : (
              <div className="w-max min-w-0 max-w-52 md:shrink-0">
                <OrganizationSwitcher
                  compactOnMobile
                  subscriptionTier={settings?.subscriptionTier}
                />
              </div>
            )}

            <div className="w-max min-w-0 max-w-52 md:shrink-0">
              <AppProtectedBrandSwitcher
                brandSlug={brandSlug}
                isAdminChrome={isAdminChrome}
                orgSlug={orgSlug}
              />
            </div>

            <div className={cn('min-w-0 md:flex', !isAppsRoute && 'hidden')}>
              {isAppsRoute ? (
                <nav aria-label={translateApps('breadcrumbLabel')}>
                  <span className="text-sm font-semibold">
                    {translateApps('title')}
                  </span>
                </nav>
              ) : (
                <TopbarBreadcrumbs
                  fallbackRootLabel={
                    TOPBAR_BREADCRUMB_ROOT_LABELS[breadcrumbFallbackApp]
                  }
                  rootLabel={isSettingsRoute ? 'Settings' : undefined}
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 items-center justify-end gap-1 md:gap-1.5">
          <div className="flex min-w-0 items-center gap-1 md:gap-1.5">
            {!isAdminChrome ? <CreditsLiveSync /> : null}

            {!isAdminChrome ? <TopbarAppsLink orgSlug={orgSlug} /> : null}

            {!isAdminChrome ? <NotificationInboxMenu /> : null}
          </div>
          {!isAdminChrome ? <GenerationToasts /> : null}

          {/* Status only: it yields its slot to the agent toggle on phones. */}
          {!isAdminChrome ? (
            <span className="hidden sm:contents">
              <CloudSyncIndicator />
            </span>
          ) : null}

          {/* The side panel's Chat and Context toggles (⌘J opens Chat). */}
          <TopbarPanelToggles isAdminChrome={isAdminChrome} />
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
