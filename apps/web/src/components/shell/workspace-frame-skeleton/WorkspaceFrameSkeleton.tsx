'use client';

import { parseScopedAppPath } from '@genfeedai/contracts/constants';
import BrandMark from '@ui/primitives/brand-mark';
import { Skeleton } from '@ui/primitives/skeleton';
import { usePathname } from 'next/navigation';
import type { CSSProperties } from 'react';
import { SIDEBAR_DEFAULT_WIDTH } from '@/components/layouts/app/app-layout.utils';
import { APP_RAIL_WIDTH } from '@/components/layouts/app/useAppLayout';
import BootRecordRail from '@/components/shell/workspace-frame-skeleton/BootRecordRail';
import { hasWorkspaceSkeletonSidebar } from '@/components/shell/workspace-frame-skeleton/workspace-frame-skeleton.utils';
import { useBootRecord } from '@/lib/boot-record/use-boot-record';
import type { WorkspaceFrameSkeletonProps } from '@/props/layout/workspace-frame-skeleton.props';

const RAIL_ITEM_SLOTS = ['agent', 'library', 'posts', 'studio', 'analytics'];
const SIDEBAR_ROW_WIDTHS = ['72%', '56%', '64%', '48%', '60%', '44%'];
const TOPBAR_ACTION_SLOTS = ['inbox', 'panel', 'account'];
// The same custom properties `AppLayout` publishes, so the frame lands on its grid.
const FRAME_STYLE = {
  '--desktop-rail-width': `${APP_RAIL_WIDTH}px`,
  '--shell-topbar-height': `${APP_RAIL_WIDTH}px`,
} as CSSProperties;

/**
 * The protected app frame before the workspace is confirmed: rail, topbar,
 * and menu column at the same size and place as `AppLayout`, holding
 * placeholders instead of data. The page area stays empty: the page brings its
 * own blocks, and a second layout here would be replaced a moment later. It is drawn from the URL alone and
 * reads nothing tenant-scoped, so it can paint with the first HTML while the
 * session and routed organization are still being checked. The Genfeed mark
 * traces itself in the rail's mark band until the real shell replaces it.
 */
export default function WorkspaceFrameSkeleton({
  label,
}: WorkspaceFrameSkeletonProps) {
  const pathname = usePathname() ?? '';
  const hasSidebar = hasWorkspaceSkeletonSidebar(pathname);
  const bootRecord = useBootRecord(parseScopedAppPath(pathname).orgSlug);

  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="flex h-dvh overflow-hidden bg-background"
      data-testid="workspace-frame-skeleton"
      role="status"
      style={FRAME_STYLE}
    >
      <div
        aria-hidden={bootRecord ? undefined : 'true'}
        className="hidden w-[var(--desktop-rail-width)] shrink-0 flex-col items-center border-r border-border bg-gray-100 md:flex"
        data-testid="workspace-frame-skeleton-rail"
      >
        <div
          className="flex h-[var(--shell-topbar-height)] w-full shrink-0 items-center justify-center border-b border-border"
          data-testid="workspace-frame-skeleton-mark"
        >
          <span className="size-4 text-foreground">
            <BrandMark isCompact />
          </span>
        </div>
        {bootRecord ? (
          <BootRecordRail record={bootRecord} />
        ) : (
          <div className="flex flex-col items-center gap-1 p-2">
            {RAIL_ITEM_SLOTS.map((slot) => (
              <Skeleton key={slot} className="size-8 rounded-md" />
            ))}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          aria-hidden="true"
          className="flex h-[var(--shell-topbar-height)] shrink-0 items-center justify-between gap-3 border-b border-border px-2"
        >
          <div className="flex items-center gap-2">
            <span className="size-4 text-foreground md:hidden">
              <BrandMark isCompact />
            </span>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="hidden h-4 w-28 sm:block" />
          </div>
          <div className="flex items-center gap-1">
            {TOPBAR_ACTION_SLOTS.map((slot) => (
              <Skeleton key={slot} className="size-8 rounded-md" />
            ))}
          </div>
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background md:flex-row"
          data-testid="workspace-frame-skeleton-panel"
        >
          {hasSidebar ? (
            <div
              aria-hidden="true"
              className="hidden shrink-0 flex-col gap-3 border-r border-border bg-gray-100 px-4 py-5 md:flex"
              style={{ width: SIDEBAR_DEFAULT_WIDTH }}
            >
              {SIDEBAR_ROW_WIDTHS.map((width) => (
                <Skeleton key={width} className="h-4" width={width} />
              ))}
            </div>
          ) : null}
          <div className="min-w-0 flex-1 overflow-hidden" />
        </div>
      </div>
    </div>
  );
}
