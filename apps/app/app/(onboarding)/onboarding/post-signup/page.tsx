'use client';

import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import PostSignupFallback from './PostSignupFallback';
import { usePostSignupRouting } from './use-post-signup-routing.hook';

function PostSignupPageContent() {
  const { showFallback, statusMessage, resolveOnboardingHref } =
    usePostSignupRouting();

  return (
    <PageLoadingState
      className="bg-neutral-950"
      fullScreen={true}
      message={statusMessage}
    >
      {showFallback ? (
        <PostSignupFallback resolveOnboardingHref={resolveOnboardingHref} />
      ) : null}
    </PageLoadingState>
  );
}

export default function PostSignupPage() {
  return (
    <Suspense fallback={null}>
      <PostSignupPageContent />
    </Suspense>
  );
}
