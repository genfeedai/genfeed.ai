'use client';

import { logger } from '@genfeedai/services/core/logger.service';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  title?: string;
  description?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('[ErrorBoundary]', {
      componentStack: errorInfo.componentStack,
      error,
    });
    this.props.onError?.(error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ error: null, hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <ErrorFallback
            error={this.state.error ?? undefined}
            resetErrorBoundary={this.handleReset}
            title={this.props.title}
            description={this.props.description}
          />
        )
      );
    }
    return this.props.children;
  }
}
