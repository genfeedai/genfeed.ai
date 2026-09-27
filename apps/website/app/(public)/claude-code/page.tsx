import AgentClientPage, {
  createAgentClientMetadata,
} from '@public/agent-clients/agent-client-page';

export const generateMetadata = createAgentClientMetadata('claude-code');

export default function ClaudeCodeConnectPage(): React.ReactElement {
  return <AgentClientPage slug="claude-code" />;
}
