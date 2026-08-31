import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AgentDetailPage from './AgentDetailPage';

export const generateMetadata = createPageMetadata('Agent Detail');

export default async function AutomationAgentDetailRoute({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  return (
    <Suspense fallback={null}>
      <AgentDetailPage agentId={agentId} />
    </Suspense>
  );
}
