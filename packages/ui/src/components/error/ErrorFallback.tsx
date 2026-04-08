'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Pre } from '@genfeedai/ui';
import { Button } from '@ui/primitives/button';
import { HiOutlineExclamationTriangle } from 'react-icons/hi2';

interface ErrorFallbackProps {
  error?: Error;
  resetErrorBoundary?: () => void;
  title?: string;
  description?: string;
}

export function ErrorFallback({
  error,
  resetErrorBoundary,
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Please try again.',
}: ErrorFallbackProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center"
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-4">
        <HiOutlineExclamationTriangle className="w-6 h-6 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        {description}
      </p>
      {error?.message && process.env.NODE_ENV === 'development' && (
        <Pre className="mb-4 max-w-lg">{error.message}</Pre>
      )}
      {resetErrorBoundary && (
        <Button
          withWrapper={false}
          variant={ButtonVariant.DEFAULT}
          onClick={resetErrorBoundary}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
