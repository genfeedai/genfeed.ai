'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import AgentOutputShell from '@ui/layout/agent-output-layout/AgentOutputShell';
import MotionProjectView from '@app/(protected)/[orgSlug]/[brandSlug]/motion/components/MotionProjectView';
import { readRouteParam } from '@/lib/route-params';

/** An open project: the agent on the left, the project on the right. */
export default function MotionProjectRoute() {
  const params = useRouteParams<{ projectId: string }>();
  const projectId = readRouteParam(params.projectId);
  return (
    <AgentOutputShell>
      <MotionProjectView projectId={projectId} />
    </AgentOutputShell>
  );
}
