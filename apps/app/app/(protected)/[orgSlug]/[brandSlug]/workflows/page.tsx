import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import WorkflowLibraryPage from '@pages/workflows/library/WorkflowLibraryPage';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Agent Workflows');

export default function WorkflowsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <WorkflowLibraryPage />
    </Suspense>
  );
}
