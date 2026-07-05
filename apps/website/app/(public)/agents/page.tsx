import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AgentsContent from '@public/agents/agents-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Agents',
  'Hire autonomous AI agents that research, generate, and publish content on a schedule. Set goals and guardrails, then run campaigns on autopilot.',
  '/agents',
);

export default function Agents() {
  return <AgentsContent />;
}
