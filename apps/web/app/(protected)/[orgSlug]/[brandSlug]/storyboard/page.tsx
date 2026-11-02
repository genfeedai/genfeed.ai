import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StoryboardWorkspace from '@/features/studio/storyboard/StoryboardWorkspace';

export const generateMetadata = createPageMetadata('Storyboard');

export default function StudioStoryboardPage() {
  return <StoryboardWorkspace />;
}
