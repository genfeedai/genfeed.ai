import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import WorkflowNewPageClient from './WorkflowNewPageClient';

export const generateMetadata = createPageMetadata('Agent Workflow Editor');

export default function WorkflowNewPage() {
  return <WorkflowNewPageClient />;
}
