import type { ErrorInfo, ReactNode } from 'react';

export interface ErrorBoundaryFailure {
  error: Error;
  retryCount: number;
  canRetry: boolean;
  resetErrorBoundary: () => void;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((failure: ErrorBoundaryFailure) => ReactNode);
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
