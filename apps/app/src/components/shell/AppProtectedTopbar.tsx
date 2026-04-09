'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TopbarProps } from '@props/navigation/topbar.props';
import { Button } from '@ui/primitives/button';
import TopbarBreadcrumbs from '@ui/topbars/breadcrumbs/TopbarBreadcrumbs';
import TopbarEnd from '@ui/topbars/end/TopbarEnd';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { HiBars3, HiXMark } from 'react-icons/hi2';
import {
  appendSearchParamsToHref,
  getOperatorSurfaceDefaultPath,
  type OperatorSurface,
  pickOperatorTaskContextSearchParams,
  resolveOperatorSurface,
} from '@/lib/navigation/operator-shell';

const OPERATOR_SURFACE_ITEMS: Array<{
  id: OperatorSurface;
  label: string;
}> = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'create', label: 'Create' },
  { id: 'library', label: 'Library' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'settings', label: 'Settings' },
];

function getSurfaceHref(
  surface: OperatorSurface,
  href: (path: string) => string,
  orgHref: (path: string) => string,
  taskContextParams: URLSearchParams,
): string {
  const basePath = getOperatorSurfaceDefaultPath(surface);
  const scopedHref =
    surface === 'settings' ? orgHref(basePath) : href(basePath);

  return appendSearchParamsToHref(scopedHref, taskContextParams);
}

export default function AppProtectedTopbar({
  isMenuOpen,
  onMenuToggle,
}: TopbarProps = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { href, orgHref } = useOrgUrl();

  const activeSurface = resolveOperatorSurface(pathname);
  const taskId = searchParams?.get('taskId');
  const taskTitle = searchParams?.get('taskTitle');
  const taskContextParams = pickOperatorTaskContextSearchParams(
    new URLSearchParams(searchParams?.toString()),
  );
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

          <nav
            aria-label="Operator mode switcher"
            className="hidden items-center gap-1 rounded-full border border-white/10 bg-black/20 p-1 md:flex"
          >
            {OPERATOR_SURFACE_ITEMS.map((item) => {
              const isActive = item.id === activeSurface;

              return (
                <Link
                  key={item.id}
                  href={getSurfaceHref(
                    item.id,
                    href,
                    orgHref,
                    taskContextParams,
                  )}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white/[0.12] text-foreground'
                      : 'text-foreground/55 hover:bg-white/[0.06] hover:text-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden min-w-0 lg:block">
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
