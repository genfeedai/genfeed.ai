'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import StoryboardRunPage from '@/features/studio/storyboard/StoryboardRunPage';
import { readRouteParam } from '@/lib/route-params';

export default function StudioStoryboardRunRoute() {
  const params = useRouteParams<{ runId: string }>();
  const runId = readRouteParam(params.runId);
  return <StoryboardRunPage key={runId} runId={runId} />;
}
