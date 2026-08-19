'use client';

import type { GlobalErrorProps } from '@props/ui/feedback/global-error.props';
import { logger } from '@services/core/logger.service';
import { ThemeDocumentBootstrapScript } from '@ui/theme/ThemeBootstrapScript';
import ThemeDocumentSync from '@ui/theme/ThemeDocumentSync';
import Link from 'next/link';
import { useEffect } from 'react';

export default function GlobalError({ error }: GlobalErrorProps) {
  useEffect(() => {
    // Log to Pino and Sentry via enhanced logger service
    logger.error('Global unhandled error', {
      error,
      tags: {
        app: 'website',
        errorType: 'global-error',
      },
    });
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeDocumentBootstrapScript />
      </head>
      <body className="gf-app min-h-dvh bg-background text-foreground">
        <ThemeDocumentSync />
        <main className="flex min-h-dvh items-center justify-center p-6 text-center">
          <div className="max-w-lg">
            <h1 className="gen-heading-lg mb-4">Something went wrong</h1>
            <p className="mb-6 text-muted-foreground">
              The page could not be displayed. Your work is safe.
            </p>
            <Link
              className="inline-flex h-10 items-center justify-center border border-border bg-foreground px-5 text-sm font-semibold text-background transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href="/"
            >
              Return home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
