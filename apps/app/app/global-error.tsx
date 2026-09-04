'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@ui/primitives/button';
import { ThemeDocumentBootstrapScript } from '@ui/theme/ThemeBootstrapScript';
import ThemeDocumentSync from '@ui/theme/ThemeDocumentSync';
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeDocumentBootstrapScript />
      </head>
      <body className="gf-app gf-studio-app bg-background text-foreground">
        <ThemeDocumentSync />
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center justify-center p-8 max-w-2xl mx-auto">
            <h1 className="text-2xl font-semibold mb-4 text-center text-balance">
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
