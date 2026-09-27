import AgentClientPage, {
  createAgentClientMetadata,
} from '@public/agent-clients/agent-client-page';

export const generateMetadata = createAgentClientMetadata('cursor');

export default function CursorConnectPage(): React.ReactElement {
  return <AgentClientPage slug="cursor" />;
}
