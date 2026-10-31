import { getAgentClientChannels } from '@data/agent-client-channels.data';
import {
  type AgentClientSlug,
  buildAgentClientJsonLd,
  getAgentClient,
} from '@data/agent-clients.data';
import { stringifyJsonLd } from '@data/json-ld';
import AgentClientContent from '@public/agent-clients/agent-client-content';
import { EnvironmentService } from '@services/core/environment.service';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

const CHANNELS = getAgentClientChannels();

export function createAgentClientMetadata(slug: AgentClientSlug) {
  const client = getAgentClient(slug);

  return createPageMetadataWithCanonical(
    client.title,
    client.description,
    `/${client.slug}`,
  );
}

export default function AgentClientPage({
  slug,
}: {
  slug: AgentClientSlug;
}): React.ReactElement {
  const client = getAgentClient(slug);
  const jsonLd = buildAgentClientJsonLd(
    client,
    `${EnvironmentService.apps.website}/${client.slug}`,
  );

  return (
    <>
      <script type="application/ld+json">{stringifyJsonLd(jsonLd)}</script>
      <AgentClientContent channels={CHANNELS} client={client} />
    </>
  );
}
