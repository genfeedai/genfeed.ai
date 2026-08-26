'use client';

import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';

type PostSignupFallbackProps = {
  resolveOnboardingHref: () => Promise<string>;
};

export default function PostSignupFallback({
  resolveOnboardingHref,
}: PostSignupFallbackProps) {
  return (
    <Card className="mt-2" bodyClassName="gap-0 p-4">
      <p className="mb-3 text-xs text-muted-foreground">
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
    </Card>
  );
}
