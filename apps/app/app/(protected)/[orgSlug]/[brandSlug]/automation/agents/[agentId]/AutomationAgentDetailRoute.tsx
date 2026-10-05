'use client';

import AgentDetailPage from '@app/(protected)/[orgSlug]/[brandSlug]/automation/agents/[agentId]/AgentDetailPage';
import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function AutomationAgentDetailRoute() {
  const params = useParams<{ agentId: string }>();
  const agentId = readRouteParam(params.agentId);
  return <AgentDetailPage agentId={agentId} />;
}
