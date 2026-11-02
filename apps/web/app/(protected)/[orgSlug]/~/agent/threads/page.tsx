import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Threads');

// The agent layout (AgentConversationRouteHost) renders the master
// conversation with the Threads list beside it; this route only owns the URL.
export default function AgentThreadsPage() {
  return null;
}
