import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Workflows');
const WorkflowsPage = dynamic(
  () => import('@protected/automation/workflows/workflows-page'),
);

export default function WorkflowsPageWrapper() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <WorkflowsPage />
    </Suspense>
  );
}
