'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TopbarProps } from '@props/navigation/topbar.props';
import { Button } from '@ui/primitives/button';
import { AppSwitcher } from '@ui/shell/app-switcher/AppSwitcher';
import TopbarBreadcrumbs from '@ui/topbars/breadcrumbs/TopbarBreadcrumbs';
import TopbarEnd from '@ui/topbars/end/TopbarEnd';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { HiBars3, HiOutlineCommandLine, HiXMark } from 'react-icons/hi2';
import { EditionBadge } from '@/components/edition-badge/EditionBadge';
import { appendSearchParamsToHref } from '@/lib/navigation/operator-shell';

export default function AppProtectedTopbar({
  isMenuOpen,
  onMenuToggle,
  currentApp,
  orgSlug,
  brandSlug,
  isAgentCollapsed,
  onAgentToggle,
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
    <header className="ship-ui h-full w-full bg-transparent">
      <div className="flex h-full w-full items-center justify-between gap-2.5 pl-3 pr-2 sm:px-4 lg:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {onMenuToggle ? (
            <Button
              type="button"
              variant={ButtonVariant.UNSTYLED}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background-secondary transition-colors hover:border-border-strong hover:bg-background-tertiary md:hidden"
              data-active={isMenuOpen ? 'true' : 'false'}
              ariaLabel={
                isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'
              }
              onClick={onMenuToggle}
            >
              <ToggleIcon className="h-5 w-5" />
            </Button>
          ) : null}

          {currentApp && orgSlug ? (
            <div className="shrink-0">
              <AppSwitcher
                currentApp={currentApp}
                orgSlug={orgSlug}
                brandSlug={brandSlug}
                preservedSearch={searchParams?.toString()}
              />
            </div>
          ) : null}

          <div className="hidden min-w-0 md:flex">
            <div className="flex h-7 min-w-0 items-center rounded px-2">
              <TopbarBreadcrumbs />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2.5">
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
              variant={ButtonVariant.UNSTYLED}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background-secondary transition-colors hover:border-border-strong hover:bg-background-tertiary"
              data-active={isAgentCollapsed ? 'false' : 'true'}
              ariaLabel={
                isAgentCollapsed ? 'Open terminal dock' : 'Close terminal dock'
              }
              onClick={onAgentToggle}
            >
              <HiOutlineCommandLine className="h-4 w-4" />
            </Button>
          ) : null}

          <EditionBadge className="hidden lg:inline-flex" />

          <TopbarEnd />
        </div>
      </div>
    </header>
  );
}
