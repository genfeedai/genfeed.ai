import {
  AGENT_CLIENT_CHANNEL_SLUGS,
  buildAgentClientChannelJsonLd,
  buildAgentClientChannelPage,
  isAgentClientChannelSlug,
} from '@data/agent-client-channels.data';
import { type AgentClientSlug, getAgentClient } from '@data/agent-clients.data';
import { stringifyJsonLd } from '@data/json-ld';
import { createDynamicPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AgentClientChannelContent from '@public/agent-clients/agent-client-channel-content';
import { EnvironmentService } from '@services/core/environment.service';
import { notFound } from 'next/navigation';

export function generateAgentClientChannelParams(): { channel: string }[] {
  return AGENT_CLIENT_CHANNEL_SLUGS.map((channel) => ({ channel }));
}

export function createAgentClientChannelMetadata(slug: AgentClientSlug) {
  const client = getAgentClient(slug);

  function resolvePage(channel: string) {
    return isAgentClientChannelSlug(channel)
      ? buildAgentClientChannelPage(client, channel)
      : undefined;
  }

  return createDynamicPageMetadata(
    'channel',
    (channel) => resolvePage(channel)?.title ?? client.title,
    (channel) => `/${client.slug}/${channel}`,
    (channel) => resolvePage(channel)?.description ?? client.description,
  );
}

export default function AgentClientChannelPage({
  channel,
  slug,
}: {
  channel: string;
  slug: AgentClientSlug;
}): React.ReactElement {
  if (!isAgentClientChannelSlug(channel)) {
    notFound();
  }

  const client = getAgentClient(slug);
  const page = buildAgentClientChannelPage(client, channel);
  const clientUrl = `${EnvironmentService.apps.website}/${client.slug}`;
  const jsonLd = buildAgentClientChannelJsonLd(
    client,
    page,
    `${clientUrl}/${channel}`,
    clientUrl,
  );

  return (
    <>
      <script type="application/ld+json">{stringifyJsonLd(jsonLd)}</script>
      <AgentClientChannelContent client={client} page={page} />
    </>
  );
}
