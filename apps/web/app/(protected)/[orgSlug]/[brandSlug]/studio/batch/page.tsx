import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BatchWorkflowPage from '@pages/workflows/batch/BatchWorkflowPage';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Batch Workflow Runner');

export default function StudioBatchPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BatchWorkflowPage />
    </Suspense>
  );
}
