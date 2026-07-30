'use client';

import StoryboardWorkspace from '@pages/studio/storyboard/StoryboardWorkspace';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export default function StudioStoryboardPage() {
  return (
    <FeatureGate flagKey="studio">
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <StoryboardWorkspace />
      </Suspense>
    </FeatureGate>
  );
}
