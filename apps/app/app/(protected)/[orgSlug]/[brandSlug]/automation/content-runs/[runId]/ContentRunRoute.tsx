'use client';

import ContentRunDetailPage from '@pages/content-runs/detail/content-run-detail';

import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function ContentRunRoute() {
  const params = useParams<{ runId: string }>();
  const runId = readRouteParam(params.runId);

  return <ContentRunDetailPage runId={runId} />;
}
