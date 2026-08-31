import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import ExecutionDetailPage from '@/features/workflows/pages/executions/ExecutionDetailPage';

export const generateMetadata = createPageMetadata('Agent Workflow Execution');

export default async function WorkflowExecutionDetailPage({
  params,
}: DetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<PageLoadingState />}>
      <ExecutionDetailPage executionId={id} />
    </Suspense>
  );
}
