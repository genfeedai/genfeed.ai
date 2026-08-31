import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import BatchWorkflowPage from '@/features/workflows/pages/batch/BatchWorkflowPage';

export const generateMetadata = createPageMetadata('Batch Workflow Runner');

export default function StudioBatchPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <BatchWorkflowPage />
    </Suspense>
  );
}
