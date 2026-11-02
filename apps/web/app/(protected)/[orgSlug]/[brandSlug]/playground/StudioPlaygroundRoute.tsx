'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { Suspense } from 'react';
import StudioPlaygroundWorkspace from '@/features/studio/playground/StudioPlaygroundWorkspace';
import { readRouteParam } from '@/lib/route-params';

/** Keep the composer mounted while the URL selects the gallery or a generation. */
export default function StudioPlaygroundRoute() {
  const params = useRouteParams<{ jobId: string }>();
  const jobId = readRouteParam(params.jobId) || undefined;
  return (
    <Suspense fallback={null}>
      <StudioPlaygroundWorkspace jobId={jobId} />
    </Suspense>
  );
}
