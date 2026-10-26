import HireAgentsContent from '@public/hire-agents/hire-agents-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Hire AI Agents That Create and Publish',
  'Hire AI agents that research and draft content on a schedule. Set goals and guardrails, and approve what they make before it goes out.',
  '/hire-agents',
);

export default function HireAgents() {
  return <HireAgentsContent />;
}
