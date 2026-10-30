'use client';

import { useParams } from 'next/navigation';
import ContentRunDetailPage from '@/features/content-runs/detail/content-run-detail';
import { readRouteParam } from '@/lib/route-params';

export default function ContentRunRoute() {
  const params = useParams<{ runId: string }>();
  const runId = readRouteParam(params.runId);

  return <ContentRunDetailPage runId={runId} />;
}
