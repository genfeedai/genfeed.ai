import HireAgentsContent from '@public/hire-agents/hire-agents-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Hire AI Agents That Create and Publish',
  'Hire AI agents that research, draft, and publish content on a schedule. Review every post by default, or switch on auto-publish once you trust them.',
  '/hire-agents',
);

export default function HireAgents() {
  return <HireAgentsContent />;
}
