import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import WorkflowsContent from '@public/workflows/workflows-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Workflows',
  'Deterministic workflow control for agentic execution. Define triggers, author exact steps, inspect outputs, and let agents trigger workflows when needed.',
  '/workflows',
);

export default function Workflows() {
  return <WorkflowsContent />;
}
