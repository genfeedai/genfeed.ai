import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StoryboardWorkspace from '@pages/studio/storyboard/StoryboardWorkspace';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Storyboard');

export default function StudioStoryboardPage() {
  return (
    <Suspense fallback={null}>
      <StoryboardWorkspace />
    </Suspense>
  );
}
