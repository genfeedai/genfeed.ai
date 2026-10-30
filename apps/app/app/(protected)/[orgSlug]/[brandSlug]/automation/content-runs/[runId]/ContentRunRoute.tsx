'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import ContentRunDetailPage from '@pages/content-runs/detail/content-run-detail';
import { readRouteParam } from '@/lib/route-params';

export default function ContentRunRoute() {
  const params = useRouteParams<{ runId: string }>();
  const runId = readRouteParam(params.runId);

  return <ContentRunDetailPage runId={runId} />;
}
