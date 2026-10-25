import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StoryboardWorkspace from '@pages/studio/storyboard/StoryboardWorkspace';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('New storyboard');

export default function StudioStoryboardNewPage() {
  return (
    <Suspense fallback={null}>
      <StoryboardWorkspace />
    </Suspense>
  );
}
