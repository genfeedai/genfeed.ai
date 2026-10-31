import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StoryboardRunsPage from '@/features/studio/storyboard/StoryboardRunsPage';

export const generateMetadata = createPageMetadata('Storyboard');

export default function StudioStoryboardPage() {
  return <StoryboardRunsPage />;
}
