import { getAgentClient } from '@data/agent-clients.data';
import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AgentClientContent from '@public/agent-clients/agent-client-content';

const client = getAgentClient('claude');

export const generateMetadata = createPageMetadataWithCanonical(
  client.title,
  client.description,
  `/${client.slug}`,
);

export default function ClaudeConnectPage(): React.ReactElement {
  return <AgentClientContent client={client} />;
}
