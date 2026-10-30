'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import TurboProjectPage from '@/features/workflows/pages/turbo/TurboProjectPage';
import { readRouteParam } from '@/lib/route-params';

export default function StudioTurboProjectRoute() {
  const params = useRouteParams<{ projectId: string }>();
  const projectId = readRouteParam(params.projectId);
  return <TurboProjectPage key={projectId} projectId={projectId} />;
}
