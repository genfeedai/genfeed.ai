'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Pre } from '@ui/primitives/pre';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';

interface ErrorFallbackProps {
  error?: Error;
  resetErrorBoundary?: () => unknown;
  compact?: boolean;
  title?: string;
  description?: string;
}

export function ErrorFallback({
  error,
  resetErrorBoundary,
  compact = false,
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Please try again.',
}: ErrorFallbackProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = async () => {
    if (!resetErrorBoundary || isRetrying) return;
    setIsRetrying(true);
    try {
      await resetErrorBoundary();
    } catch {
      // Keep the existing error visible when the retry also fails.
    } finally {
      setIsRetrying(false);
    }
  };
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-3',
        compact
          ? 'flex-wrap border-b border-border p-4'
          : 'min-h-[200px] flex-col justify-center p-8 text-center',
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-destructive/10',
          compact ? 'size-8' : 'mb-4 size-12',
        )}
      >
        <TriangleAlert className="size-6 text-destructive" />
      </div>
      <div className={compact ? 'min-w-0 flex-1' : undefined}>
        <h3
          className={cn(
            'font-semibold text-foreground',
            compact ? 'text-sm' : 'mb-2 text-lg',
          )}
        >
          {title}
        </h3>
        {!compact && (
          <p className="mb-4 max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {error?.message && process.env.NODE_ENV === 'development' && (
        <Pre className="mb-4 max-w-lg">{error.message}</Pre>
      )}
      {resetErrorBoundary && (
        <Button
          ariaLabel="Try again"
          withWrapper={false}
          variant={ButtonVariant.DEFAULT}
          onClick={handleRetry}
          isLoading={isRetrying}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
