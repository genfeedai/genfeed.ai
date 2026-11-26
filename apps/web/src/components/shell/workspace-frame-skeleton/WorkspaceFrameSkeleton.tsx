'use client';

import { parseScopedAppPath } from '@genfeedai/contracts/constants';
import { usePathname } from 'next/navigation';
import WorkspaceFrame from '@/components/shell/workspace-frame-skeleton/WorkspaceFrame';
import { hasWorkspaceSkeletonSidebar } from '@/components/shell/workspace-frame-skeleton/workspace-frame-skeleton.utils';
import { useBootRecord } from '@/lib/boot-record/use-boot-record';
import type { WorkspaceFrameSkeletonProps } from '@/props/layout/workspace-frame-skeleton.props';

/**
 * The protected app frame before the workspace is confirmed, drawn from the
 * URL alone. It reads nothing tenant-scoped, so it can paint with the first
 * HTML while the session and routed organization are still being checked. The
 * page area stays empty: the page brings its own blocks, and a second layout
 * here would be replaced a moment later.
 */
export default function WorkspaceFrameSkeleton({
  label,
}: WorkspaceFrameSkeletonProps) {
  const pathname = usePathname() ?? '';
  const hasSidebar = hasWorkspaceSkeletonSidebar(pathname);
  const bootRecord = useBootRecord(parseScopedAppPath(pathname).orgSlug);

  return (
    <WorkspaceFrame
      bootRecord={bootRecord}
      hasSidebar={hasSidebar}
      label={label}
    />
  );
}
