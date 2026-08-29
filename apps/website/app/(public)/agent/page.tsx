import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AgentContent from '@public/agent/agent-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Genfeed Agent — CLI, MCP Server, and Skills',
  'Run Genfeed from your terminal with the CLI, or connect Claude Code, Codex, and any MCP client to the hosted Genfeed MCP server. Install, authenticate, and start generating.',
  '/agent',
);

export default function Agent() {
  return <AgentContent />;
}
