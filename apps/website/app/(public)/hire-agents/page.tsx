import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import HireAgentsContent from '@public/hire-agents/hire-agents-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Hire AI Agents That Create and Publish',
  'Hire autonomous AI agents that research, generate, and publish content on a schedule. Set goals and guardrails, then run campaigns on autopilot.',
  '/hire-agents',
);

export default function HireAgents() {
  return <HireAgentsContent />;
}
