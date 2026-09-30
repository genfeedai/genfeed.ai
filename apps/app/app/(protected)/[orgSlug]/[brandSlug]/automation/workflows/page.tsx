import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { BrandAppPageProps } from '@props/pages/page.props';
import { Suspense } from 'react';
import WorkflowLibraryPage from '@/features/workflows/pages/library/WorkflowLibraryPage';
import WorkflowTemplatesPage from '@/features/workflows/pages/templates/WorkflowTemplatesPage';
import { parseWorkflowCollectionView } from '@/features/workflows/pages/workflow-library-tabs';

export const generateMetadata = createPageMetadata('Agent Workflows');

export default async function WorkflowsPage({
  searchParams,
}: BrandAppPageProps) {
  const query = searchParams ? await searchParams : {};
  const view = parseWorkflowCollectionView(query.view);

  return (
    <Suspense fallback={null}>
      {view === 'templates' ? (
        <WorkflowTemplatesPage />
      ) : (
        <WorkflowLibraryPage />
      )}
    </Suspense>
  );
}
