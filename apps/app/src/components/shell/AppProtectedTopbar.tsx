'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TopbarProps } from '@props/navigation/topbar.props';
import { Button } from '@ui/primitives/button';
import { AppSwitcher } from '@ui/shell/app-switcher/AppSwitcher';
import TopbarBreadcrumbs from '@ui/topbars/breadcrumbs/TopbarBreadcrumbs';
import TopbarEnd from '@ui/topbars/end/TopbarEnd';
import TopbarOrganizationSwitcher from '@ui/topbars/organization-switcher/TopbarOrganizationSwitcher';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { HiBars3, HiXMark } from 'react-icons/hi2';
import { appendSearchParamsToHref } from '@/lib/navigation/operator-shell';

export default function AppProtectedTopbar({
  isMenuOpen,
  onMenuToggle,
  currentApp,
  orgSlug,
  brandSlug,
}: TopbarProps = {}) {
  const searchParams = useSearchParams();
  const { href } = useOrgUrl();

  const taskId = searchParams?.get('taskId');
  const taskTitle = searchParams?.get('taskTitle');
  const ToggleIcon = isMenuOpen ? HiXMark : HiBars3;
  const backToTaskHref = taskId
    ? href(
        appendSearchParamsToHref(
          '/workspace/overview',
          new URLSearchParams([['taskId', taskId]]),
        ),
      )
    : null;

  return (
    <header className="h-full w-full bg-transparent">
      <div className="flex h-full w-full items-center justify-between gap-3 pl-4 pr-2 sm:pl-6 sm:pr-3 lg:pl-8 lg:pr-2">
        <div className="flex min-w-0 items-center gap-3">
          {onMenuToggle ? (
            <Button
              type="button"
              variant={ButtonVariant.UNSTYLED}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground md:hidden"
              ariaLabel={
                isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'
              }
              onClick={onMenuToggle}
            >
              <ToggleIcon className="h-5 w-5" />
            </Button>
          ) : null}

          {currentApp && orgSlug ? (
            <AppSwitcher
              currentApp={currentApp}
              orgSlug={orgSlug}
              brandSlug={brandSlug}
            />
          ) : null}

          <TopbarOrganizationSwitcher />

          <div className="hidden min-w-0 md:block">
            <TopbarBreadcrumbs />
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          {taskId ? (
            <div className="hidden items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100 lg:flex">
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

          <TopbarEnd />
        </div>
      </div>
    </header>
  );
}
