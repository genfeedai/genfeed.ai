import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import WorkflowExecutionsPage from '@/features/workflows/pages/executions/WorkflowExecutionsPage';

export const generateMetadata = createPageMetadata('Agent Workflow Executions');

export default function WorkflowsExecutionsPage() {
  return <WorkflowExecutionsPage />;
}
