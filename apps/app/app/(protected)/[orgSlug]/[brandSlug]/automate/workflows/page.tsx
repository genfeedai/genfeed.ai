import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import WorkflowLibraryPage from '@/features/workflows/pages/library/WorkflowLibraryPage';

export const generateMetadata = createPageMetadata('Agent Workflows');

export default function WorkflowsPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <WorkflowLibraryPage />
    </Suspense>
  );
}
