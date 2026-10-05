import AgentContent from '@public/agent/agent-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'AI Content Agent: Ask Once, Show Up Everywhere',
  'Ask the Genfeed agent for on-brand videos, images, ads and posts. Approve the first few; once it has earned your trust, it publishes on its own.',
  '/agent',
);

export default function Agent() {
  return <AgentContent />;
}
