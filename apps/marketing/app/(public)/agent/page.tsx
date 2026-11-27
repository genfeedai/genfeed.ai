import AgentContent from '@public/agent/agent-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'AI Marketing Agent: Genfeed MCP, CLI and Skills',
  'Use Genfeed as your AI social media agent: add it to Claude, ChatGPT, Codex or Cursor over MCP, brief it, then review, publish and track results.',
  '/agent',
);

export default function Agent() {
  return <AgentContent />;
}
