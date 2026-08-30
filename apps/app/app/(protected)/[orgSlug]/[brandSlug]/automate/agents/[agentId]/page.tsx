import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import AgentDetailPage from './AgentDetailPage';

export const generateMetadata = createPageMetadata('Agent Detail');

export default async function AutomateAgentDetailRoute({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  return (
    <Suspense fallback={<PageLoadingState />}>
      <AgentDetailPage agentId={agentId} />
    </Suspense>
  );
}
