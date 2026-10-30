'use client';

import ClipperWorkspace from '@app/(protected)/[orgSlug]/[brandSlug]/clipper/ClipperWorkspace';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { readRouteParam } from '@/lib/route-params';

export default function StudioClipperProjectRoute() {
  const params = useRouteParams<{ projectId: string }>();
  const projectId = readRouteParam(params.projectId);

  return <ClipperWorkspace projectId={projectId} />;
}
