import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import StoryboardWorkspace from '@/features/studio/storyboard/StoryboardWorkspace';

export const generateMetadata = createPageMetadata('New storyboard');

export default function StudioStoryboardNewPage() {
  return (
    <Suspense fallback={null}>
      <StoryboardWorkspace />
    </Suspense>
  );
}
