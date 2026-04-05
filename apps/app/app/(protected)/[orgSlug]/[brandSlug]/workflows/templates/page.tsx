import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import WorkflowTemplatesPage from '@pages/workflows/templates/WorkflowTemplatesPage';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Agent Workflow Templates');

export default function WorkflowsTemplatesPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <WorkflowTemplatesPage />
    </Suspense>
  );
}
