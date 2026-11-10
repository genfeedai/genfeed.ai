import AgentContent from '@public/agent/agent-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Use Genfeed From Your Agent: MCP, CLI and Skills',
  'Add Genfeed to Claude, ChatGPT, Codex, Cursor or any MCP client. Brief your agent, then review, publish and track in the dashboard. Or use the CLI.',
  '/agent',
);

export default function Agent() {
  return <AgentContent />;
}
