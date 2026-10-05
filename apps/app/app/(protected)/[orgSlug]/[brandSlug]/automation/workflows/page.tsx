import WorkflowsRoute from '@app/(protected)/[orgSlug]/[brandSlug]/automation/workflows/WorkflowsRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Agent Workflows');

export default function WorkflowsPage() {
  return (
    <Suspense fallback={null}>
      <WorkflowsRoute />
    </Suspense>
  );
}
