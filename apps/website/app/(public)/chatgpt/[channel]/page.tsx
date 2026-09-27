import AgentClientChannelPage, {
  createAgentClientChannelMetadata,
  generateAgentClientChannelParams,
} from '@public/agent-clients/agent-client-channel-page';

export const dynamicParams = false;

export const generateStaticParams = generateAgentClientChannelParams;

export const generateMetadata = createAgentClientChannelMetadata('chatgpt');

export default async function ChatGptChannelPage({
  params,
}: {
  params: Promise<{ channel: string }>;
}): Promise<React.ReactElement> {
  const { channel } = await params;
  return <AgentClientChannelPage channel={channel} slug="chatgpt" />;
}
