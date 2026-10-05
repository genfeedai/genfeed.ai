'use client';

import { useParams } from 'next/navigation';
import BatchProjectPage from '@/features/workflows/pages/batch/BatchProjectPage';
import { readRouteParam } from '@/lib/route-params';

export default function StudioBatchProjectRoute() {
  const params = useParams<{ projectId: string }>();
  const projectId = readRouteParam(params.projectId);
  return <BatchProjectPage key={projectId} projectId={projectId} />;
}
