import AgentClientChannelPage, {
  createAgentClientChannelMetadata,
  generateAgentClientChannelParams,
} from '@public/agent-clients/agent-client-channel-page';

export const dynamicParams = false;

export const generateStaticParams = generateAgentClientChannelParams;

export const generateMetadata = createAgentClientChannelMetadata('muse');

export default async function MuseChannelPage({
  params,
}: {
  params: Promise<{ channel: string }>;
}): Promise<React.ReactElement> {
  const { channel } = await params;
  return <AgentClientChannelPage channel={channel} slug="muse" />;
}
