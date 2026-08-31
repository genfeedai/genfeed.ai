'use client';

import StoryboardWorkspace from '@pages/studio/storyboard/StoryboardWorkspace';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export default function StudioStoryboardPage() {
  return (
    <FeatureGate flagKey="studio">
      <Suspense fallback={<PageLoadingState />}>
        <StoryboardWorkspace />
      </Suspense>
    </FeatureGate>
  );
}
