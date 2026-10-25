'use client';

import StoryboardRunPage from '@pages/studio/storyboard/StoryboardRunPage';
import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function StudioStoryboardRunRoute() {
  const params = useParams<{ runId: string }>();
  const runId = readRouteParam(params.runId);
  return <StoryboardRunPage key={runId} runId={runId} />;
}
