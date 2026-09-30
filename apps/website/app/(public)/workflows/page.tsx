import WorkflowsContent from '@public/workflows/workflows-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Workflows: Deterministic AI Runs',
  'Deterministic workflow control for agentic execution. Define triggers, author exact steps, inspect outputs, and let agents trigger workflows when needed.',
  '/workflows',
);

export default function Workflows() {
  return <WorkflowsContent />;
}
