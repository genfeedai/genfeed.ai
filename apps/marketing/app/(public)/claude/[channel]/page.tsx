import AgentClientChannelPage, {
  createAgentClientChannelMetadata,
  generateAgentClientChannelParams,
} from '@public/agent-clients/agent-client-channel-page';

export const dynamicParams = false;

export const generateStaticParams = generateAgentClientChannelParams;

export const generateMetadata = createAgentClientChannelMetadata('claude');

export default async function ClaudeChannelPage({
  params,
}: {
  params: Promise<{ channel: string }>;
}): Promise<React.ReactElement> {
  const { channel } = await params;
  return <AgentClientChannelPage channel={channel} slug="claude" />;
}
