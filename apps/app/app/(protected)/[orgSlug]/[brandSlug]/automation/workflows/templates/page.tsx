import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import WorkflowTemplatesPage from '@/features/workflows/pages/templates/WorkflowTemplatesPage';

export const generateMetadata = createPageMetadata('Workflow Templates');

export default function WorkflowTemplatesRoutePage() {
  return (
    <Suspense fallback={null}>
      <WorkflowTemplatesPage />
    </Suspense>
  );
}
