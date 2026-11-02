'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import StoryboardRunPage from '@/features/studio/storyboard/StoryboardRunPage';
import { readRouteParam } from '@/lib/route-params';

export default function StudioStoryboardRunRoute() {
  const params = useRouteParams<{ runId: string }>();
  const runId = readRouteParam(params.runId);
  // Until Next resolves the param, an empty id would request the run list
  // (`/storyboard-runs/`) and show it as an invalid storyboard document.
  if (!runId) return null;
  return <StoryboardRunPage key={runId} runId={runId} />;
}
