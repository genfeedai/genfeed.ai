import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AgentThreadRouteGuard from './agent-thread-route-guard';

export const generateMetadata = createPageMetadata('Agent');

export default function ChatThreadPage() {
  return <AgentThreadRouteGuard />;
}
