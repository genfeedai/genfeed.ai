'use client';

import type { IErrorBoundaryState } from '@genfeedai/contracts/interfaces/utils/error.interface';
import type {
  ErrorBoundaryFailure,
  ErrorBoundaryProps,
} from '@genfeedai/props/ui/feedback/error-boundary.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import { Component, type ErrorInfo } from 'react';

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  IErrorBoundaryState
> {
  state: IErrorBoundaryState = { error: null, hasError: false, retryCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<IErrorBoundaryState> {
    return { error, hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (this.props.reportError) {
      this.props.reportError(error, errorInfo, this.getFailure(error));
    } else {
      logger.error('[ErrorBoundary]', {
        componentStack: errorInfo.componentStack,
        error,
      });
    }
    this.props.onError?.(error, errorInfo);
  }

  private get canRetry(): boolean {
    return (
      this.state.retryCount <
      (this.props.maxRetries ?? Number.POSITIVE_INFINITY)
    );
  }

  private handleReset = () => {
    if (!this.canRetry) return;
    this.setState((state) => ({
      error: null,
      hasError: false,
      retryCount: state.retryCount + 1,
    }));
    this.props.onReset?.();
  };

  private getFailure(error: Error): ErrorBoundaryFailure {
    return {
      canRetry: this.canRetry,
      error,
      resetErrorBoundary: this.handleReset,
      retryCount: this.state.retryCount,
    };
  }

  render() {
    const { error } = this.state;
    if (!this.state.hasError) return this.props.children;
    if (typeof this.props.fallback === 'function') {
      return this.props.fallback(
        this.getFailure(error ?? new Error('An unexpected error occurred')),
      );
    }
    return (
      this.props.fallback ?? (
        <ErrorFallback
          error={error ?? undefined}
          resetErrorBoundary={this.canRetry ? this.handleReset : undefined}
          title={this.props.title}
          description={this.props.description}
        />
      )
    );
  }
}
