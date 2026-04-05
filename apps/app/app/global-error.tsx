'use client';

import { ButtonVariant } from '@genfeedai/enums';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@ui/primitives/button';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="fixed inset-0 flex items-center justify-center bg-card z-40">
          <div className="flex flex-col items-center justify-center p-8 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-4 text-center">
              Something went wrong
            </h1>
            <p className="text-base text-foreground/70 mb-6 text-center">
              {error.message || 'An unexpected error occurred'}
            </p>
            <Button
              variant={ButtonVariant.DEFAULT}
              onClick={reset}
              aria-label="Try again"
            >
              Try Again
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
