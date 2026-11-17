'use client';

import { Suspense } from 'react';
import PostSignupFallback from './PostSignupFallback';
import SkippedHandleNotice from './SkippedHandleNotice';
import { usePostSignupRouting } from './use-post-signup-routing.hook';

function PostSignupPageContent() {
  const {
    continueAfterSkippedHandle,
    resolveOnboardingHref,
    retryBrandOsHandoff,
    showFallback,
    skippedHandle,
  } = usePostSignupRouting();

  if (skippedHandle) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-primary px-6 py-10">
        <div className="w-full max-w-md">
          <SkippedHandleNotice
            handle={skippedHandle.handle}
            onContinue={continueAfterSkippedHandle}
          />
        </div>
      </main>
    );
  }

  return showFallback ? (
    <main className="flex min-h-dvh items-center justify-center bg-primary px-6 py-10">
      <div className="w-full max-w-md">
        <PostSignupFallback
          resolveOnboardingHref={resolveOnboardingHref}
          retryBrandOsHandoff={retryBrandOsHandoff}
        />
      </div>
    </main>
  ) : null;
}

export default function PostSignupPage() {
  return (
    <Suspense fallback={null}>
      <PostSignupPageContent />
    </Suspense>
  );
}
