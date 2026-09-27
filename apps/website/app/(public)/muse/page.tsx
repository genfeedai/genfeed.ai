import AgentClientPage, {
  createAgentClientMetadata,
} from '@public/agent-clients/agent-client-page';

export const generateMetadata = createAgentClientMetadata('muse');

export default function MuseConnectPage(): React.ReactElement {
  return <AgentClientPage slug="muse" />;
}
