'use client';

import ClipperWorkspace from '@app/(protected)/[orgSlug]/[brandSlug]/clipper/ClipperWorkspace';
import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function StudioClipperProjectRoute() {
  const params = useParams<{ projectId: string }>();
  const projectId = readRouteParam(params.projectId);

  return <ClipperWorkspace projectId={projectId} />;
}
