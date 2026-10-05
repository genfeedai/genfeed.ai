'use client';

import type { DetailPageProps } from '@props/pages/page.props';

import { useParams } from 'next/navigation';
import ExecutionDetailPage from '@/features/workflows/pages/executions/ExecutionDetailPage';
import { readRouteParam } from '@/lib/route-params';

export default function WorkflowRunDetailRoute() {
  const params = useParams<Awaited<DetailPageProps['params']>>();
  const id = readRouteParam(params.id);

  return <ExecutionDetailPage executionId={id} />;
}
