'use client';

import BrandMark from '@ui/primitives/brand-mark';
import { Skeleton } from '@ui/primitives/skeleton';
import type { CSSProperties } from 'react';
import { SIDEBAR_DEFAULT_WIDTH } from '@/components/layouts/app/app-layout.utils';
import { APP_RAIL_WIDTH } from '@/components/layouts/app/useAppLayout';
import BootRecordRail from '@/components/shell/workspace-frame-skeleton/BootRecordRail';
import type { WorkspaceFrameProps } from '@/props/layout/workspace-frame-skeleton.props';

const RAIL_ITEM_SLOTS = ['agent', 'library', 'posts', 'studio', 'analytics'];
const SIDEBAR_ROW_WIDTHS = ['72%', '56%', '64%', '48%', '60%', '44%'];
const TOPBAR_ACTION_SLOTS = ['inbox', 'panel', 'account'];
// The same custom properties `AppLayout` publishes, so the frame lands on its grid.
const FRAME_STYLE = {
  '--desktop-rail-width': `${APP_RAIL_WIDTH}px`,
  '--shell-topbar-height': `${APP_RAIL_WIDTH}px`,
} as CSSProperties;

/**
 * The protected app frame as markup: rail, topbar, and menu column at the same
 * size and place as `AppLayout`, holding placeholders instead of data. It takes
 * everything it draws as props and reads neither the pathname nor the session,
 * so it can stand in a Suspense fallback that is prerendered with the page.
 */
export default function WorkspaceFrame({
  bootRecord,
  hasSidebar,
  label,
}: WorkspaceFrameProps) {
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

      {hasSidebar ? (
        <div
          aria-hidden="true"
          className="hidden shrink-0 flex-col border-r border-border bg-gray-100 md:flex"
          data-testid="workspace-frame-skeleton-sidebar"
          style={{ width: SIDEBAR_DEFAULT_WIDTH }}
        >
          <div className="h-[var(--shell-topbar-height)] shrink-0 border-b border-border" />
          <div className="flex flex-col gap-3 px-4 py-5">
            {SIDEBAR_ROW_WIDTHS.map((width) => (
              <Skeleton key={width} className="h-4" width={width} />
            ))}
          </div>
        </div>
      ) : null}

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
          <div className="min-w-0 flex-1 overflow-hidden" />
        </div>
      </div>
    </div>
  );
}
