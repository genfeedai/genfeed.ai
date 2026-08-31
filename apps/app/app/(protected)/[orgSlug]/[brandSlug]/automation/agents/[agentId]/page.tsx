import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AgentDetailPage from './AgentDetailPage';

export const generateMetadata = createPageMetadata('Agent Detail');

export default async function AutomationAgentDetailRoute({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  return <AgentDetailPage agentId={agentId} />;
}
