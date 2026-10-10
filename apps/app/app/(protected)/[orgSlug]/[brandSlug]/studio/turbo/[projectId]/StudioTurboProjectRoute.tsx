'use client';

import { useParams } from 'next/navigation';
import TurboProjectPage from '@/features/workflows/pages/turbo/TurboProjectPage';
import { readRouteParam } from '@/lib/route-params';

export default function StudioTurboProjectRoute() {
  const params = useParams<{ projectId: string }>();
  const projectId = readRouteParam(params.projectId);
  return <TurboProjectPage key={projectId} projectId={projectId} />;
}
