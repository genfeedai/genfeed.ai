import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import WorkflowLibraryPage from '@/features/workflows/pages/library/WorkflowLibraryPage';

export const generateMetadata = createPageMetadata('Agent Workflows');

export default function WorkflowsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <WorkflowLibraryPage />
    </Suspense>
  );
}
