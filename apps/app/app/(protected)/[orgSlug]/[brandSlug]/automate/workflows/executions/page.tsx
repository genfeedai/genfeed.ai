import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import WorkflowExecutionsPage from '@/features/workflows/pages/executions/WorkflowExecutionsPage';

export const generateMetadata = createPageMetadata('Agent Workflow Executions');

export default function WorkflowsExecutionsPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <WorkflowExecutionsPage />
    </Suspense>
  );
}
