import AgentClientPage, {
  createAgentClientMetadata,
} from '@public/agent-clients/agent-client-page';

export const generateMetadata = createAgentClientMetadata('hermes');

export default function HermesConnectPage(): React.ReactElement {
  return <AgentClientPage slug="hermes" />;
}
