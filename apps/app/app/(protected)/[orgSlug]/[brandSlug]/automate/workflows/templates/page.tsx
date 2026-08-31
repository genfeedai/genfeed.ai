import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import WorkflowTemplatesPage from '@/features/workflows/pages/templates/WorkflowTemplatesPage';

export const generateMetadata = createPageMetadata('Agent Workflow Templates');

export default function WorkflowsTemplatesPage() {
  return (
    <Suspense fallback={null}>
      <WorkflowTemplatesPage />
    </Suspense>
  );
}
