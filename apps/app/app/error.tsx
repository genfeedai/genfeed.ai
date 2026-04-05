'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { ErrorProps } from '@props/ui/feedback/error.props';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import { useEffect } from 'react';

export default function AppError({ error, reset }: ErrorProps) {
  useEffect(() => {
    logger.error('Route segment error', {
      error,
      tags: {
        app: 'app',
        errorType: 'route-error',
        segment: 'root',
      },
    });
  }, [error]);

  return (
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
  );
}
