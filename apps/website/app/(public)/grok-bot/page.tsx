import AgentClientPage, {
  createAgentClientMetadata,
} from '@public/agent-clients/agent-client-page';

export const generateMetadata = createAgentClientMetadata('grok-bot');

export default function GrokBotConnectPage(): React.ReactElement {
  return <AgentClientPage slug="grok-bot" />;
}
