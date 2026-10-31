import AgentClientPage, {
  createAgentClientMetadata,
} from '@public/agent-clients/agent-client-page';

export const generateMetadata = createAgentClientMetadata('grok');

export default function GrokConnectPage(): React.ReactElement {
  return <AgentClientPage slug="grok" />;
}
