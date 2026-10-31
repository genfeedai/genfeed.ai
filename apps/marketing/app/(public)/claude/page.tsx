import AgentClientPage, {
  createAgentClientMetadata,
} from '@public/agent-clients/agent-client-page';

export const generateMetadata = createAgentClientMetadata('claude');

export default function ClaudeConnectPage(): React.ReactElement {
  return <AgentClientPage slug="claude" />;
}
