import AgentClientPage, {
  createAgentClientMetadata,
} from '@public/agent-clients/agent-client-page';

export const generateMetadata = createAgentClientMetadata('gemini');

export default function GeminiConnectPage(): React.ReactElement {
  return <AgentClientPage slug="gemini" />;
}
