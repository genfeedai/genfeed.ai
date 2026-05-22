'use client';

import { ButtonSize, ButtonVariant, GenerationType } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TopbarProps } from '@props/navigation/topbar.props';
import { Button } from '@ui/primitives/button';
import MergedSwitcher from '@ui/shell/merged-switcher/MergedSwitcher';
import TopbarBrandSwitcher from '@ui/topbars/brand-switcher/TopbarBrandSwitcher';
import TopbarBreadcrumbs from '@ui/topbars/breadcrumbs/TopbarBreadcrumbs';
import TopbarCreditsBar from '@ui/topbars/credits-bar/TopbarCreditsBar';
import TopbarEnd from '@ui/topbars/end/TopbarEnd';
import TopbarOrganizationSwitcher from '@ui/topbars/organization-switcher/TopbarOrganizationSwitcher';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo } from 'react';
import {
  HiBars3,
  HiOutlineCog6Tooth,
  HiOutlineCommandLine,
  HiXMark,
} from 'react-icons/hi2';
import { PiSidebarSimple } from 'react-icons/pi';
import CloudSyncIndicator from '@/components/cloud-sync-indicator/CloudSyncIndicator';
import { appendSearchParamsToHref } from '@/lib/navigation/operator-shell';

const GENERATION_TYPE_PATHS: Partial<Record<GenerationType, string>> = {
  [GenerationType.CLIP]: '/studio/clips',
  [GenerationType.IMAGE]: '/studio/image',
  [GenerationType.PODCAST]: '/studio/music',
  [GenerationType.VIDEO]: '/studio/video',
};

function resolveCurrentGenerationType(
  pathname: string,
): GenerationType | undefined {
  if (pathname.startsWith('/studio/video')) {
    return GenerationType.VIDEO;
  }

  if (pathname.startsWith('/studio/image') || pathname === '/studio') {
    return GenerationType.IMAGE;
  }

  if (pathname.startsWith('/studio/clips')) {
    return GenerationType.CLIP;
  }

  if (pathname.startsWith('/studio/music')) {
    return GenerationType.PODCAST;
  }

  return undefined;
}

function stripProtectedScope(rawPathname: string): string {
  const parts = rawPathname.split('/').filter(Boolean);

  if (parts.length >= 3) {
    return `/${parts.slice(2).join('/')}`;
  }

  return rawPathname;
}

function AppProtectedTopbarContent({
  isMenuOpen,
  onMenuToggle,
  isSidebarCollapsed,
  onSidebarToggle,
  isAgentCollapsed,
  onAgentToggle,
  brandSlug,
  currentApp = 'workspace',
  orgSlug,
}: TopbarProps = {}) {
  const { get, toString: stringifySearchParams } = useSearchParams();
  const pathname = usePathname();
  const { push } = useRouter();
  const {
    href,
    orgHref,
    orgSlug: resolvedOrgSlug,
    brandSlug: resolvedBrandSlug,
  } = useOrgUrl();

  const taskId = get('taskId');
  const taskTitle = get('taskTitle');
  const ToggleIcon = isMenuOpen ? HiXMark : HiBars3;
  const scopedPathname = useMemo(
    () => stripProtectedScope(pathname),
    [pathname],
  );
  const currentGenerationType = useMemo(
    () => resolveCurrentGenerationType(scopedPathname),
    [scopedPathname],
  );
  const preservedSearch = stringifySearchParams();
  const effectiveOrgSlug = orgSlug || resolvedOrgSlug;
  const effectiveBrandSlug = brandSlug || resolvedBrandSlug;
  const backToTaskHref = taskId
    ? href(
        appendSearchParamsToHref(
          '/workspace/overview',
          new URLSearchParams([['taskId', taskId]]),
        ),
      )
    : null;
  const handleGenerationTypeChange = useCallback(
    (generationType: GenerationType) => {
      const generationPath = GENERATION_TYPE_PATHS[generationType];
      if (!generationPath) {
        return;
      }

      const nextSearchParams = new URLSearchParams(preservedSearch);
      nextSearchParams.delete('type');
      push(href(appendSearchParamsToHref(generationPath, nextSearchParams)));
    },
    [href, preservedSearch, push],
  );

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

          <div className="min-w-0">
            <TopbarBreadcrumbs />
          </div>

          {effectiveOrgSlug ? (
            <div className="hidden shrink-0 md:block">
              <MergedSwitcher
                brandSlug={effectiveBrandSlug}
                currentApp={currentApp}
                currentGenerationType={currentGenerationType}
                onGenerationTypeChange={handleGenerationTypeChange}
                orgSlug={effectiveOrgSlug}
                preservedSearch={preservedSearch}
              />
            </div>
          ) : null}
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

          <div className="hidden min-w-0 items-center gap-1 lg:flex">
            <TopbarOrganizationSwitcher />
            <TopbarBrandSwitcher />
          </div>

          <TopbarCreditsBar />

          <Link
            href={orgHref('/settings')}
            className="inline-flex size-7 items-center justify-center rounded-md bg-transparent text-foreground/56 transition-colors hover:bg-hover hover:text-foreground"
            title="Settings"
          >
            <HiOutlineCog6Tooth className="size-4" />
          </Link>

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
