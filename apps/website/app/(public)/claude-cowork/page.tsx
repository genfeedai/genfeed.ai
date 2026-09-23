import { getAgentClient } from '@data/agent-clients.data';
import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AgentClientContent from '@public/agent-clients/agent-client-content';

const client = getAgentClient('claude-cowork');

export const generateMetadata = createPageMetadataWithCanonical(
  client.title,
  client.description,
  `/${client.slug}`,
);

export default function ClaudeCoworkConnectPage(): React.ReactElement {
  return <AgentClientContent client={client} />;
}
