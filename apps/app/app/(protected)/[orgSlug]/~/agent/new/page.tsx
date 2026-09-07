import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AgentConversationReset from '../agent-conversation-reset';

export const generateMetadata = createPageMetadata('New Conversation');

export default function ChatNewPage() {
  return <AgentConversationReset />;
}
