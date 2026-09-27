import {
  type AgentClientSlug,
  buildAgentClientJsonLd,
  getAgentClient,
} from '@data/agent-clients.data';
import { integrations } from '@data/integrations.data';
import { stringifyJsonLd } from '@data/json-ld';
import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AgentClientContent from '@public/agent-clients/agent-client-content';
import { EnvironmentService } from '@services/core/environment.service';

const CHANNELS = integrations.map(({ name, slug }) => ({ name, slug }));

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
