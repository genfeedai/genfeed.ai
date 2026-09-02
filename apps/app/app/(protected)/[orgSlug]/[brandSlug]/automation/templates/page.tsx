import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import WorkflowTemplatesPage from '@/features/workflows/pages/templates/WorkflowTemplatesPage';

export const generateMetadata = createPageMetadata('Workflow Templates');

export default function WorkflowTemplatesRoute() {
  return <WorkflowTemplatesPage />;
}
