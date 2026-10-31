import AgentClientPage, {
  createAgentClientMetadata,
} from '@public/agent-clients/agent-client-page';

export const generateMetadata = createAgentClientMetadata('openclaw');

export default function OpenClawConnectPage(): React.ReactElement {
  return <AgentClientPage slug="openclaw" />;
}
