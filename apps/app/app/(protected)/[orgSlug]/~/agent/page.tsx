import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AgentConversationReset from './agent-conversation-reset';

export const generateMetadata = createPageMetadata('Agent');

export default function AgentPage() {
  return <AgentConversationReset />;
}
