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
import { withMarketingOgMetadata } from '@web-components/og/marketing-metadata';
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

  const generate = createDynamicPageMetadata(
    'channel',
    (channel) => resolvePage(channel)?.title ?? client.title,
    (channel) => `/${client.slug}/${channel}`,
    (channel) => resolvePage(channel)?.description ?? client.description,
  );

  return async (...args: Parameters<typeof generate>) => {
    const { channel } = await args[0].params;
    return withMarketingOgMetadata(
      await generate(...args),
      `/${client.slug}/${channel}`,
      resolvePage(channel)?.title ?? client.title,
    );
  };
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
