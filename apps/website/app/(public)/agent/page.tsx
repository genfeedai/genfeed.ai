import AgentContent from '@public/agent/agent-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'AI Content Agent — Create, Review, Publish',
  'Ask the Genfeed agent for on-brand videos, images, ads, and posts; review every output before scheduling approved content to 20+ channels.',
  '/agent',
);

export default function Agent() {
  return <AgentContent />;
}
