import StoryboardRunPage from '@/features/studio/storyboard/StoryboardRunPage';
import type { StoryboardRunPageProps } from '@/props/pages/page.props';

/** Resolve the real request-time id instead of a cached client placeholder. */
export default async function StudioStoryboardRunRoute({
  params,
}: StoryboardRunPageProps) {
  const { runId } = await params;
  return <StoryboardRunPage key={runId} runId={runId} />;
}
