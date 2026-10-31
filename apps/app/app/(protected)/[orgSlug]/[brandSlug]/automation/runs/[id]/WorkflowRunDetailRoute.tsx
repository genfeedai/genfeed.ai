'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import ExecutionDetailPage from '@/features/workflows/pages/executions/ExecutionDetailPage';
import { readRouteParam } from '@/lib/route-params';
import type { DetailPageProps } from '@/props/pages/page.props';

export default function WorkflowRunDetailRoute() {
  const params = useRouteParams<Awaited<DetailPageProps['params']>>();
  const id = readRouteParam(params.id);

  return <ExecutionDetailPage executionId={id} />;
}
