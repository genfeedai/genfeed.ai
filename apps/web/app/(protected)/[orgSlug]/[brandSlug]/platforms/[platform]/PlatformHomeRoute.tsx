'use client';

import { parsePlatform } from '@genfeedai/contracts';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import WorkspacePagePending from '@/components/shell/workspace-frame-skeleton/WorkspacePagePending';
import { readRouteParam } from '@/lib/route-params';
import PlatformHomePage from './content';

/**
 * Reads the platform on the client, so the page is part of the prerendered
 * route shell and a click on it paints at once instead of waiting for a
 * server render. Before the platform is known the shell shows the page-body
 * placeholder; an unknown platform is a 404.
 */
export default function PlatformHomeRoute() {
  const params = useRouteParams<{ platform?: string | string[] }>();
  const segment = readRouteParam(params.platform);

  if (!segment) {
    return <WorkspacePagePending />;
  }

  const platform = parsePlatform(segment);

  if (!platform) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <PlatformHomePage platform={platform} />
    </Suspense>
  );
}
