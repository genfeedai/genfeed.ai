import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import ExecutionDetailPage from '@/features/workflows/pages/executions/ExecutionDetailPage';

export const generateMetadata = createPageMetadata('Agent Workflow Execution');

export default async function WorkflowExecutionDetailPage({
  params,
}: DetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ExecutionDetailPage executionId={id} />
    </Suspense>
  );
}
