import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StoryboardRunsPage from '@pages/studio/storyboard/StoryboardRunsPage';

export const generateMetadata = createPageMetadata('Storyboard');

export default function StudioStoryboardPage() {
  return <StoryboardRunsPage />;
}
