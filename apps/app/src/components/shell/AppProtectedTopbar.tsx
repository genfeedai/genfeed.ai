'use client';

import { isPersonalSettingsPage } from '@app-components/app-protected-layout.settings-scope';
import {
  AGENT_DOCK_CHROME_VISIBLE,
  useAgentDock,
} from '@contexts/ui/agent-dock-context';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_DISPLAY_LABELS } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers';
import type { TopbarProps } from '@props/navigation/topbar.props';
import OrganizationSwitcher from '@ui/menus/organization-switcher/OrganizationSwitcher';
import { Button } from '@ui/primitives/button';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import TopbarBreadcrumbs from '@ui/topbars/breadcrumbs/TopbarBreadcrumbs';
import TopbarCreditsBar from '@ui/topbars/credits-bar/TopbarCreditsBar';
import { Menu, PanelBottomClose, PanelBottomOpen, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, Suspense, useId } from 'react';

import CloudSyncIndicator from '@/components/cloud-sync-indicator/CloudSyncIndicator';
import AppProtectedBrandSwitcher from '@/components/shell/AppProtectedBrandSwitcher';
import GenerationToasts from '@/components/shell/GenerationToasts';
import NotificationInboxMenu from '@/components/shell/NotificationInboxMenu';

const TOPBAR_BREADCRUMB_ROOT_LABELS: Record<
  NonNullable<TopbarProps['currentApp']>,
  string
> = {
  admin: APP_DISPLAY_LABELS.admin,
  agent: APP_DISPLAY_LABELS.agent,
  analytics: APP_DISPLAY_LABELS.analytics,
  automation: APP_DISPLAY_LABELS.automation,
  clips: APP_DISPLAY_LABELS.clips,
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

type UnavailableToggleFrameProps = {
  children: ReactNode;
  className?: string;
  isUnavailable: boolean;
  reason: string;
};

// A disabled button is not in the tab order and does not receive pointer
// events, so the reason has to live on a focusable wrapper. The button stays
// natively disabled; Enter/Space on the wrapper do not activate it.
function UnavailableToggleFrame({
  children,
  className,
  isUnavailable,
  reason,
}: UnavailableToggleFrameProps) {
  const reasonId = useId();

  if (!isUnavailable) {
    return <span className={className}>{children}</span>;
  }

  return (
    <SimpleTooltip label={reason} position="bottom">
      <span
        aria-describedby={reasonId}
        aria-label={reason}
        className={cn(
          'rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
          }
        }}
        role="group"
        // The disabled button cannot take focus. This group is the tab stop
        // that exposes the reason; removing tabIndex hides it from the keyboard.
        // biome-ignore lint/a11y/noNoninteractiveTabindex: disabled control's reason needs a focusable wrapper
        tabIndex={0}
      >
        {children}
        <span className="sr-only" id={reasonId}>
          {reason}
        </span>
      </span>
    </SimpleTooltip>
  );
}

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
  const isSettingsRoute =
    pathname?.split('/').filter(Boolean)[2] === 'settings';
  const { settings } = useBrand();
  const agentDock = useAgentDock();
  const translateAgentDock = useTranslations('common.agentDock');

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

          <div className="hidden min-w-0 md:flex">
            <TopbarBreadcrumbs
              fallbackRootLabel={
                TOPBAR_BREADCRUMB_ROOT_LABELS[breadcrumbFallbackApp]
              }
              rootLabel={isSettingsRoute ? 'Settings' : undefined}
            />
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 items-center justify-end gap-1 md:gap-1.5">
          {!isAdminChrome ? <TopbarCreditsBar /> : null}

          {!isAdminChrome ? <NotificationInboxMenu /> : null}
          {!isAdminChrome ? <GenerationToasts /> : null}

          {!isAdminChrome ? <CloudSyncIndicator /> : null}

          {/* Account chrome only. The details toggle lives on the page
              sub-nav: it opens the inspector inside the content. The
              agent-dock toggle uses the unavailable frame, but page-bubble
              chrome leaves it unmounted. */}
          {agentDock && AGENT_DOCK_CHROME_VISIBLE ? (
            <UnavailableToggleFrame
              className="inline-flex"
              isUnavailable={!agentDock.isAvailable}
              reason={translateAgentDock('unavailable')}
            >
              <Button
                aria-controls="workspace-agent-dock"
                aria-expanded={agentDock.isAvailable && agentDock.isOpen}
                aria-keyshortcuts="Meta+J Control+J"
                type="button"
                variant={ButtonVariant.GHOST}
                size={ButtonSize.ICON}
                className="size-8"
                data-active={
                  agentDock.isAvailable && agentDock.isOpen ? 'true' : 'false'
                }
                data-testid="topbar-agent-dock-toggle"
                isDisabled={!agentDock.isAvailable}
                withWrapper={false}
                ariaLabel={
                  !agentDock.isAvailable
                    ? translateAgentDock('unavailable')
                    : agentDock.isOpen
                      ? translateAgentDock('close')
                      : translateAgentDock('open')
                }
                onClick={agentDock.toggle}
              >
                {agentDock.isAvailable && agentDock.isOpen ? (
                  <PanelBottomClose className="size-4" />
                ) : (
                  <PanelBottomOpen className="size-4" />
                )}
              </Button>
            </UnavailableToggleFrame>
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
