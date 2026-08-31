import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import WorkflowExecutionsPage from '@/features/workflows/pages/executions/WorkflowExecutionsPage';

export const generateMetadata = createPageMetadata('Agent Workflow Executions');

export default function WorkflowsExecutionsPage() {
  return (
    <Suspense fallback={null}>
      <WorkflowExecutionsPage />
    </Suspense>
  );
}
