'use client';

import type { ErrorProps } from '@props/ui/feedback/error.props';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@services/core/logger.service';
import { ErrorFallback } from '@ui/error';
import { useEffect } from 'react';

export default function WorkspaceError({ error, reset }: ErrorProps) {
  useEffect(() => {
    logger.error('Workspace route segment error', {
      error,
      tags: {
        app: 'app',
        errorType: 'route-error',
        segment: 'workspace',
      },
    });
    Sentry.captureException(error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      resetErrorBoundary={reset}
      title="Something went wrong"
      description="The workspace could not finish loading. Try again."
    />
  );
}
