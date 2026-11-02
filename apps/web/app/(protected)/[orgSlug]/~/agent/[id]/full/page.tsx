import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AgentThreadRouteGuard from '../agent-thread-route-guard';

export const generateMetadata = createPageMetadata('Agent');

// One thread as the full-width conversation, hosted by the agent layout. The
// way back to the master layout is `/agent/[id]`.
export default function ChatThreadFullPage() {
  return <AgentThreadRouteGuard />;
}
