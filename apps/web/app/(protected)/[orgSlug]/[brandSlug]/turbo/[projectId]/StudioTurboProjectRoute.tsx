'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import AgentOutputShell from '@ui/layout/agent-output-layout/AgentOutputShell';
import TurboProjectPage from '@/features/workflows/pages/turbo/TurboProjectPage';
import { readRouteParam } from '@/lib/route-params';

/** An open project: the agent on the left, the project on the right. */
export default function StudioTurboProjectRoute() {
  const params = useRouteParams<{ projectId: string }>();
  const projectId = readRouteParam(params.projectId);
  return (
    <AgentOutputShell>
      <TurboProjectPage key={projectId} projectId={projectId} />
    </AgentOutputShell>
  );
}
