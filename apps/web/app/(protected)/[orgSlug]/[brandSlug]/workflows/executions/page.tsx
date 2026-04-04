import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import WorkflowExecutionsPage from '@pages/workflows/executions/WorkflowExecutionsPage';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Agent Workflow Executions');

export default function WorkflowsExecutionsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <WorkflowExecutionsPage />
    </Suspense>
  );
}
