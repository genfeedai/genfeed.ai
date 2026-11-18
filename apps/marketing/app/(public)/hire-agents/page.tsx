import HireAgentsContent from '@public/hire-agents/hire-agents-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Put AI Agents to Work on Your Content',
  'Connect your own agent or use Genfeed’s agents to research, draft, and publish content on a schedule. Review every post by default, or switch on auto-publish once you trust them.',
  '/hire-agents',
);

export default function HireAgents() {
  return <HireAgentsContent />;
}
