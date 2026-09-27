import AgentClientPage, {
  createAgentClientMetadata,
} from '@public/agent-clients/agent-client-page';

export const generateMetadata = createAgentClientMetadata('chatgpt');

export default function ChatGptConnectPage(): React.ReactElement {
  return <AgentClientPage slug="chatgpt" />;
}
