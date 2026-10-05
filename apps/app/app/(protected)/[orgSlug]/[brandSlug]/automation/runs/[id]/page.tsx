import WorkflowRunDetailRoute from '@app/(protected)/[orgSlug]/[brandSlug]/automation/runs/[id]/WorkflowRunDetailRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Workflow Run');

export default function WorkflowRunDetailPage() {
  return <WorkflowRunDetailRoute />;
}
