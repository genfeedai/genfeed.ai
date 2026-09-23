import { getAgentClient } from '@data/agent-clients.data';
import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AgentClientContent from '@public/agent-clients/agent-client-content';

const client = getAgentClient('openclaw');

export const generateMetadata = createPageMetadataWithCanonical(
  client.title,
  client.description,
  `/${client.slug}`,
);

export default function OpenClawConnectPage(): React.ReactElement {
  return <AgentClientContent client={client} />;
}
