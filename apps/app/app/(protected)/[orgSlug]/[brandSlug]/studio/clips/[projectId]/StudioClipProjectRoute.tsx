'use client';

import ClipsWorkspace from '@app/(protected)/[orgSlug]/[brandSlug]/studio/clips/ClipsWorkspace';
import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function StudioClipProjectRoute() {
  const params = useParams<{ projectId: string }>();
  const projectId = readRouteParam(params.projectId);

  return <ClipsWorkspace projectId={projectId} />;
}
