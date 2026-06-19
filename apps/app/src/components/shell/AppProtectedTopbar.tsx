'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TopbarProps } from '@props/navigation/topbar.props';
import { Button } from '@ui/primitives/button';
import { AppSwitcher } from '@ui/shell/app-switcher/AppSwitcher';
import TopbarCreditsBar from '@ui/topbars/credits-bar/TopbarCreditsBar';
import TopbarEnd from '@ui/topbars/end/TopbarEnd';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { HiBars3, HiOutlineCommandLine, HiXMark } from 'react-icons/hi2';
import { PiSidebarSimple } from 'react-icons/pi';
import CloudSyncIndicator from '@/components/cloud-sync-indicator/CloudSyncIndicator';
import { appendSearchParamsToHref } from '@/lib/navigation/operator-shell';

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
  // Route props are authoritative. Only fall back to useOrgUrl when the shell
  // is rendered without route context.
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

  const taskId = searchParams.get('taskId');
  const taskTitle = searchParams.get('taskTitle');
  const ToggleIcon = isMenuOpen ? HiXMark : HiBars3;
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
      <div className="flex h-full w-full items-center justify-between gap-2.5 pl-3 pr-2 sm:px-4 lg:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
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

          {effectiveOrgSlug ? (
            <div className="min-w-0">
              <AppSwitcher
                variant="labeled"
                currentApp={currentApp ?? 'workspace'}
                orgSlug={effectiveOrgSlug}
                brandSlug={effectiveBrandSlug}
              />
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          {taskId ? (
            <div className="hidden items-center gap-2 rounded border border-border bg-background-secondary px-2 py-1 text-[11px] lg:flex">
              <span className="font-semibold uppercase tracking-[0.14em] text-emerald-200/80">
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
                  className="font-semibold text-emerald-100 hover:text-white"
                >
                  Back to task
                </Link>
              ) : null}
            </div>
          ) : null}

          {onAgentToggle ? (
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

          <TopbarCreditsBar />

          <TopbarEnd />
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
