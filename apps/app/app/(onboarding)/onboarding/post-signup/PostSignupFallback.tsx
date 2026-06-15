'use client';

import { Button } from '@ui/primitives/button';

type PostSignupFallbackProps = {
  resolveOnboardingHref: () => Promise<string>;
};

export default function PostSignupFallback({
  resolveOnboardingHref,
}: PostSignupFallbackProps) {
  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <p className="mb-3 text-xs text-white/50">
        This is taking longer than expected. You can continue manually.
      </p>
      <Button
        label="Continue to onboarding"
        onClick={() => {
          void resolveOnboardingHref().then((href) => {
            window.location.href = href;
          });
        }}
        className="h-8 px-3 text-xs font-medium"
      />
    </div>
  );
}
