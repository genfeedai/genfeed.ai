'use client';

import type { AsyncState } from '@props/shared';
import { Button } from '@ui/primitives/button';
import type { ReactNode } from 'react';

interface PublishingOverviewAsyncSectionProps<TData> {
  children: (data: TData) => ReactNode;
  errorMessage: string;
  loadingLabel: string;
  onRetry: () => void;
  state: AsyncState<TData>;
}

export default function PublishingOverviewAsyncSection<TData>({
  children,
  errorMessage,
  loadingLabel,
  onRetry,
  state,
}: PublishingOverviewAsyncSectionProps<TData>) {
  if (state.status === 'error') {
    return (
      <div
        className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5"
        role="alert"
      >
        <p className="text-sm text-destructive">{errorMessage}</p>
        <Button onClick={onRetry} withWrapper={false}>
          Try again
        </Button>
      </div>
    );
  }

  if (state.status === 'success') {
    return children(state.data);
  }

  return (
    <div
      aria-live="polite"
      className="space-y-2 px-4 py-3 sm:px-5"
      role="status"
    >
      <span className="sr-only">{loadingLabel}</span>
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  );
}
