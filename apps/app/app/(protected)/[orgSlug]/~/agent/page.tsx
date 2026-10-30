import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Agent');

// The master conversation is hosted by the agent layout
// (AgentConversationRouteHost), which also opens it; there is no reset here.
export default function AgentPage() {
  return null;
}
