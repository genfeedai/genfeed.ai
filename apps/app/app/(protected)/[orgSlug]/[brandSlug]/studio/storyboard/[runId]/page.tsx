import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StoryboardRunPage from '@pages/studio/storyboard/StoryboardRunPage';

export const generateMetadata = createPageMetadata('Storyboard run');

export default async function StudioStoryboardRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <StoryboardRunPage key={runId} runId={runId} />;
}
