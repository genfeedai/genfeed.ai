'use client';

import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';

type PostSignupFallbackProps = {
  resolveOnboardingHref: () => Promise<string>;
  retryBrandOsHandoff?: (() => void) | undefined;
};

export default function PostSignupFallback({
  resolveOnboardingHref,
  retryBrandOsHandoff,
}: PostSignupFallbackProps) {
  return (
    <Card className="mt-2" bodyClassName="gap-0 p-4">
      <p className="mb-3 text-xs text-muted-foreground">
        {retryBrandOsHandoff
          ? 'Your preview was not consumed. Retry the secure workspace handoff.'
          : 'This is taking longer than expected. You can continue manually.'}
      </p>
      <Button
        label={
          retryBrandOsHandoff
            ? 'Retry saving Brand OS'
            : 'Continue to onboarding'
        }
        onClick={() => {
          if (retryBrandOsHandoff) {
            retryBrandOsHandoff();
            return;
          }
          void resolveOnboardingHref().then((href) => {
            window.location.href = href;
          });
        }}
        className="h-8 px-3 text-xs font-medium"
      />
    </Card>
  );
}
