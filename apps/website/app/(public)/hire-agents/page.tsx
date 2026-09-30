import HireAgentsContent from '@public/hire-agents/hire-agents-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Hire AI Agents That Create and Publish',
  'Hire autonomous AI agents that research, generate, and publish content on a schedule. Set goals and guardrails, then run campaigns on autopilot.',
  '/hire-agents',
);

export default function HireAgents() {
  return <HireAgentsContent />;
}
