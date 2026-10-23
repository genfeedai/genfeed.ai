import type { ErrorInfo, ReactNode } from 'react';

export interface ErrorBoundaryFailure {
  error: Error;
  retryCount: number;
  canRetry: boolean;
  resetErrorBoundary: () => void;
}

interface ErrorBoundaryCommonProps {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  reportError?: (
    error: Error,
    errorInfo: ErrorInfo,
    failure: ErrorBoundaryFailure,
  ) => void;
  onReset?: () => void;
  maxRetries?: number;
  title?: string;
  description?: string;
}

interface InlineErrorBoundaryProps extends ErrorBoundaryCommonProps {
  presentation: 'inline';
  fallback?: ReactNode | ((failure: ErrorBoundaryFailure) => ReactNode);
}

interface PageErrorBoundaryProps extends ErrorBoundaryCommonProps {
  presentation?: 'page';
  fallback?: ReactNode | ((error: Error, errorInfo: ErrorInfo) => ReactNode);
}

/** Defaults: page retries three times; inline has no retry limit. */
export type ErrorBoundaryProps =
  | InlineErrorBoundaryProps
  | PageErrorBoundaryProps;
