export interface ErrorFallbackProps {
  error?: Error;
  resetErrorBoundary?: () => unknown;
  compact?: boolean;
  title?: string;
  description?: string;
}
