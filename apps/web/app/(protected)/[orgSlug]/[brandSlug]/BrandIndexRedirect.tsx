'use client';

import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import WorkspaceContentSkeleton from '@/components/shell/workspace-frame-skeleton/WorkspaceContentSkeleton';
import { readRouteParam } from '@/lib/route-params';

/**
 * Bare `/:org/:brand` is not a product surface. It lands on the brand's
 * Workspace overview. The redirect runs on the client, so the page is part of
 * the prerendered route shell and a click on the bare address paints at once;
 * a server redirect has no shell to prepare and waits on the server for every
 * click.
 */
export default function BrandIndexRedirect() {
  const params = useRouteParams<{
    brandSlug?: string | string[];
    orgSlug?: string | string[];
  }>();
  const { replace } = useRouter();
  const brandSlug = readRouteParam(params.brandSlug);
  const orgSlug = readRouteParam(params.orgSlug);

  useEffect(() => {
    if (!orgSlug || !brandSlug) {
      return;
    }

    replace(
      createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.WORKSPACE.OVERVIEW),
    );
  }, [brandSlug, orgSlug, replace]);

  return <WorkspaceContentSkeleton />;
}
