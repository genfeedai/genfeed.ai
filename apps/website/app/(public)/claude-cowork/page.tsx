import AgentClientPage, {
  createAgentClientMetadata,
} from '@public/agent-clients/agent-client-page';

export const generateMetadata = createAgentClientMetadata('claude-cowork');

export default function ClaudeCoworkConnectPage(): React.ReactElement {
  return <AgentClientPage slug="claude-cowork" />;
}
