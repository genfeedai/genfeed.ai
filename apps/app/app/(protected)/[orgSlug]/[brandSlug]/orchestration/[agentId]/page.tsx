import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import AgentDetailPage from './AgentDetailPage';

export const generateMetadata = createPageMetadata('Agent Detail');

export default async function OrchestrationAgentDetailRoute({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AgentDetailPage agentId={agentId} />
    </Suspense>
  );
}
