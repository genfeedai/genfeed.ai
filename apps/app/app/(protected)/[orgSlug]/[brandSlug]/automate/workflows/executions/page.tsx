import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import WorkflowExecutionsPage from '@/features/workflows/pages/executions/WorkflowExecutionsPage';

export const generateMetadata = createPageMetadata('Agent Workflow Executions');

export default function WorkflowsExecutionsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <WorkflowExecutionsPage />
    </Suspense>
  );
}
