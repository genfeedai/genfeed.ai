'use client';

import type { GlobalErrorProps } from '@props/ui/feedback/global-error.props';
import { logger } from '@services/core/logger.service';
import NextError from 'next/error';
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
    <html lang="en">
      <body>
        {/* `NextError` is the default Next.js error page component. Its type
        definition requires a `statusCode` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
