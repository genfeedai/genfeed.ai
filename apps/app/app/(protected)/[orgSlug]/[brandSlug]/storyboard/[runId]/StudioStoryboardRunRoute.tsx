'use client';

import { useParams } from 'next/navigation';
import StoryboardRunPage from '@/features/studio/storyboard/StoryboardRunPage';
import { readRouteParam } from '@/lib/route-params';

export default function StudioStoryboardRunRoute() {
  const params = useParams<{ runId: string }>();
  const runId = readRouteParam(params.runId);
  return <StoryboardRunPage key={runId} runId={runId} />;
}
