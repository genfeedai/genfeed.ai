'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import WorkspacePagePending from '@/components/shell/workspace-frame-skeleton/WorkspacePagePending';
import TrendsPlatformDetail from '@/features/trends/platform-detail/trends-platform-detail';
import { isTrendPlatform } from '@/features/trends/shared/trends-platforms';
import { readRouteParam } from '@/lib/route-params';

/**
 * Reads the platform on the client, so the page is part of the prerendered
 * route shell and a click on it paints at once instead of waiting for a
 * server render. Before the platform is known the shell shows the page-body
 * placeholder; an unknown platform is a 404.
 */
export default function TrendsPlatformRoute() {
  const params = useRouteParams<{ platform?: string | string[] }>();
  const platform = readRouteParam(params.platform);

  if (!platform) {
    return <WorkspacePagePending />;
  }

  if (!isTrendPlatform(platform)) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <TrendsPlatformDetail platform={platform} />
    </Suspense>
  );
}
