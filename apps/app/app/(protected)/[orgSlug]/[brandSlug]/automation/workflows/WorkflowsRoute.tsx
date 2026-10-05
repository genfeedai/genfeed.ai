'use client';

import { useSearchParams } from 'next/navigation';
import WorkflowLibraryPage from '@/features/workflows/pages/library/WorkflowLibraryPage';
import WorkflowTemplatesPage from '@/features/workflows/pages/templates/WorkflowTemplatesPage';
import { parseWorkflowCollectionView } from '@/features/workflows/pages/workflow-library-tabs';

export default function WorkflowsRoute() {
  const searchParams = useSearchParams();
  const viewValues = searchParams.getAll('view');
  const query = { view: viewValues.length > 1 ? viewValues : viewValues[0] };
  const view = parseWorkflowCollectionView(query.view);

  return view === 'templates' ? (
    <WorkflowTemplatesPage />
  ) : (
    <WorkflowLibraryPage />
  );
}
