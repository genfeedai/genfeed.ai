import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Workflows');
const WorkflowsPage = dynamic(
  () => import('@protected/automation/workflows/workflows-page'),
);

export default function WorkflowsPageWrapper() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <WorkflowsPage />
    </Suspense>
  );
}
