'use client';

import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import type { IErrorDebugInfo } from '@genfeedai/contracts/interfaces/modals/error-debug.interface';
import type { IErrorBoundaryState } from '@genfeedai/contracts/interfaces/utils/error.interface';
import {
  closeModal,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import type {
  ErrorBoundaryFailure,
  ErrorBoundaryProps,
} from '@genfeedai/props/ui/feedback/error-boundary.props';
import { deferredLogger } from '@genfeedai/services/core/deferred-logger';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { setErrorDebugInfo } from '@genfeedai/services/core/error-debug-store';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import { Button } from '@ui/primitives/button';
import { Component, type ErrorInfo } from 'react';

const PAGE_MAX_RETRIES = 3;

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
    } else if (this.props.presentation === 'inline') {
      deferredLogger.error('[ErrorBoundary]', {
        componentStack: errorInfo.componentStack,
        error,
      });
    } else {
      this.reportPageError(error, errorInfo);
      return;
    }
    this.props.onError?.(error, errorInfo);
  }

  private get maxRetries(): number {
    return (
      this.props.maxRetries ??
      (this.props.presentation === 'inline'
        ? Number.POSITIVE_INFINITY
        : PAGE_MAX_RETRIES)
    );
  }

  private get canRetry(): boolean {
    return this.state.retryCount < this.maxRetries;
  }

  private handleReset = () => {
    if (!this.canRetry) return;
    this.setState((state) => ({
      error: null,
      hasError: false,
      retryCount: state.retryCount + 1,
    }));
    if (this.props.presentation !== 'inline') {
      closeModal(ModalEnum.ERROR_DEBUG);
    }
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

  private reportPageError(error: Error, errorInfo: ErrorInfo): void {
    const failure = this.getFailure(error);
    const context = {
      componentStack: errorInfo.componentStack,
      maxRetries: this.maxRetries,
      retryCount: failure.retryCount,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };
    deferredLogger.error('ErrorBoundary caught an error', {
      ...context,
      error,
      tags: {
        errorBoundary: 'true',
        maxRetries: String(this.maxRetries),
        retryCount: String(failure.retryCount),
      },
    });
    this.props.onError?.(error, {
      componentStack: errorInfo.componentStack ?? undefined,
    });
    const debugInfo: IErrorDebugInfo = {
      context,
      errorCode: 'ERROR_BOUNDARY',
      message: error.message || 'An unexpected error occurred',
      onRetry: failure.canRetry ? failure.resetErrorBoundary : undefined,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    };
    setErrorDebugInfo(debugInfo);
    if (!EnvironmentService.isProduction && typeof window !== 'undefined') {
      openModal(ModalEnum.ERROR_DEBUG);
    }
  }

  private renderFallback(error: Error) {
    const { props } = this;
    if (props.presentation === 'inline') {
      return typeof props.fallback === 'function'
        ? props.fallback(this.getFailure(error))
        : (props.fallback ?? (
            <ErrorFallback
              error={error}
              resetErrorBoundary={this.canRetry ? this.handleReset : undefined}
              title={props.title}
              description={props.description}
            />
          ));
    }
    if (props.fallback) {
      return typeof props.fallback === 'function'
        ? props.fallback(
            new Error(error.message || 'An unexpected error occurred'),
            { componentStack: error.stack },
          )
        : props.fallback;
    }
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-card z-40">
        <div className="flex flex-col items-center justify-center p-8 max-w-2xl mx-auto">
          <h1 className="text-2xl font-semibold mb-4 text-center">
            {props.title ?? 'Something went wrong'}
          </h1>
          <p className="text-base text-foreground/70 mb-4 text-center">
            {props.description ??
              (error.message || 'An unexpected error occurred')}
          </p>
          {this.canRetry && (
            <Button
              withWrapper={false}
              variant={ButtonVariant.DEFAULT}
              onClick={this.handleReset}
              ariaLabel="Try again"
            >
              Try Again
            </Button>
          )}
        </div>
      </div>
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const error = this.state.error ?? new Error('An unexpected error occurred');
    return (
      <div data-testid="error-boundary-fallback">
        {this.renderFallback(error)}
      </div>
    );
  }
}

export default ErrorBoundary;
