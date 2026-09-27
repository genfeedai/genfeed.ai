'use client';

import { useContextSidebar } from '@contexts/ui/context-sidebar-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_DISPLAY_LABELS } from '@genfeedai/contracts/constants';
import type { TopbarProps } from '@props/navigation/topbar.props';
import SidebarLogoToggleButton from '@ui/menus/sidebar-logo-toggle/SidebarLogoToggleButton';
import { Button } from '@ui/primitives/button';
import TopbarBreadcrumbs from '@ui/topbars/breadcrumbs/TopbarBreadcrumbs';
import TopbarCreditsBar from '@ui/topbars/credits-bar/TopbarCreditsBar';
import { Menu, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

import CloudSyncIndicator from '@/components/cloud-sync-indicator/CloudSyncIndicator';
import GenerationToasts from '@/components/shell/GenerationToasts';
import NotificationInboxMenu from '@/components/shell/NotificationInboxMenu';
import { useWorkspaceInspector } from '@/components/workspace-shell/WorkspaceInspectorContext';

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

function AppProtectedTopbarContent({
  chrome = 'app',
  isMenuOpen,
  onMenuToggle,
  isSidebarCollapsed,
  onSidebarToggle,
  currentApp,
}: AppProtectedTopbarProps = {}) {
  const pathname = usePathname();
  // Settings routes (/:org/~/settings or /:org/:brand/settings) show
  // "Settings" as the breadcrumb root. Inspect the app-route segment so a
  // brand slug named "settings" cannot trigger the settings breadcrumb.
  const isSettingsRoute =
    pathname?.split('/').filter(Boolean)[2] === 'settings';
  const workspaceInspector = useWorkspaceInspector();
  const contextSidebar = useContextSidebar();
  const translateContextSidebar = useTranslations('common.contextSidebar');
  // A selection owns the right column, so the toggle drives the context
  // sidebar while one is registered and the legacy inspector otherwise.
  const rightPanel = contextSidebar?.selection
    ? {
        isMobileOpen: contextSidebar.isMobileOpen,
        isOpen: contextSidebar.isOpen,
        labels: {
          close: translateContextSidebar('close'),
          collapse: translateContextSidebar('collapse'),
          expand: translateContextSidebar('expand'),
          open: translateContextSidebar('open'),
        },
        setIsMobileOpen: contextSidebar.setIsMobileOpen,
        toggle: contextSidebar.toggle,
      }
    : workspaceInspector?.isRegistered
      ? {
          isMobileOpen: workspaceInspector.isMobileOpen,
          isOpen: workspaceInspector.isOpen,
          labels: {
            close: 'Close workspace inspector',
            collapse: 'Collapse workspace inspector',
            expand: 'Expand workspace inspector',
            open: 'Open workspace inspector',
          },
          setIsMobileOpen: workspaceInspector.setIsMobileOpen,
          toggle: workspaceInspector.toggle,
        }
      : null;

  const ToggleIcon = isMenuOpen ? X : Menu;
  const isAdminChrome = chrome === 'admin';
  // Breadcrumb fallback label only (the app rail's active state is path-based).
  const breadcrumbFallbackApp = isAdminChrome
    ? 'admin'
    : (currentApp ?? 'workspace');
  return (
    <header className="h-full w-full bg-transparent">
      {/* Page identity and actions only: the brand switcher is the sidebar
          header and the organization is on the app rail. */}
      <div
        data-testid="app-protected-topbar-inner"
        className="grid h-full w-full grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(min-content,1fr)] items-center gap-3 px-3"
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
          {!isAdminChrome ? <TopbarCreditsBar /> : null}

          {!isAdminChrome ? <NotificationInboxMenu /> : null}
          {!isAdminChrome ? <GenerationToasts /> : null}

          {!isAdminChrome ? <CloudSyncIndicator /> : null}

          {/* Last control in the bar, always: the inspector's only opener
              lives here — and pinning it to the extreme right means it never
              shifts between states. At `xl` and up it collapses/expands the
              rail; below `xl` the rail is display:none, so the same slot
              swaps to a variant that opens the inspector drawer instead. */}
          {rightPanel ? (
            <>
              <Button
                aria-controls="workspace-context-inspector"
                aria-expanded={rightPanel.isOpen}
                type="button"
                variant={ButtonVariant.GHOST}
                size={ButtonSize.ICON}
                className="hidden size-8 xl:inline-flex"
                data-active={rightPanel.isOpen ? 'true' : 'false'}
                data-testid="topbar-inspector-toggle"
                ariaLabel={
                  rightPanel.isOpen
                    ? rightPanel.labels.collapse
                    : rightPanel.labels.expand
                }
                onClick={rightPanel.toggle}
              >
                {rightPanel.isOpen ? (
                  <PanelRightClose className="size-4" />
                ) : (
                  <PanelRightOpen className="size-4" />
                )}
              </Button>
              <Button
                aria-controls="workspace-context-inspector-drawer"
                aria-expanded={rightPanel.isMobileOpen}
                type="button"
                variant={ButtonVariant.GHOST}
                size={ButtonSize.ICON}
                className="inline-flex size-8 xl:hidden"
                data-testid="topbar-inspector-drawer-toggle"
                ariaLabel={
                  rightPanel.isMobileOpen
                    ? rightPanel.labels.close
                    : rightPanel.labels.open
                }
                onClick={() =>
                  rightPanel.setIsMobileOpen(!rightPanel.isMobileOpen)
                }
              >
                {rightPanel.isMobileOpen ? (
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
