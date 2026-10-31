'use client';

import AgentDetailPage from '@app/(protected)/[orgSlug]/[brandSlug]/automation/agents/[agentId]/AgentDetailPage';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { readRouteParam } from '@/lib/route-params';

export default function AutomationAgentDetailRoute() {
  const params = useRouteParams<{ agentId: string }>();
  const agentId = readRouteParam(params.agentId);
  return <AgentDetailPage agentId={agentId} />;
}
