'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { Suspense } from 'react';
import StudioPlaygroundWorkspace from '@/features/studio/playground/StudioPlaygroundWorkspace';
import { readRouteParam } from '@/lib/route-params';

/** An open generation: the prompt on the left, the generation on the right. */
export default function StudioPlaygroundJobRoute() {
  const params = useRouteParams<{ jobId: string }>();
  const jobId = readRouteParam(params.jobId);
  return (
    <Suspense fallback={null}>
      <StudioPlaygroundWorkspace jobId={jobId} />
    </Suspense>
  );
}
