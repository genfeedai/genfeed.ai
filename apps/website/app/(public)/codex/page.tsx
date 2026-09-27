import AgentClientPage, {
  createAgentClientMetadata,
} from '@public/agent-clients/agent-client-page';

export const generateMetadata = createAgentClientMetadata('codex');

export default function CodexConnectPage(): React.ReactElement {
  return <AgentClientPage slug="codex" />;
}
