'use client';

import { ButtonVariant, ModalEnum } from '@genfeedai/enums';
import type { IErrorDebugInfo } from '@genfeedai/interfaces/modals/error-debug.interface';
import type {
  IErrorBoundaryProps,
  IErrorBoundaryState,
} from '@genfeedai/interfaces/utils/error.interface';
import { closeModal, openModal } from '@helpers/ui/modal/modal.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { setErrorDebugInfo } from '@services/core/error-debug-store';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import { Component, type ErrorInfo } from 'react';

class ErrorBoundary extends Component<
  IErrorBoundaryProps,
  IErrorBoundaryState
> {
  private maxRetries = 3;

  public state: IErrorBoundaryState = {
    hasError: false,
    retryCount: 0,
  };

  public static getDerivedStateFromError(
    error: Error,
  ): Partial<IErrorBoundaryState> {
    return {
      errorMessage: error.message,
      errorStack: error.stack,
      hasError: true,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught an error', {
      componentStack: errorInfo.componentStack,
      error,
      retryCount: this.state.retryCount,
      tags: {
        errorBoundary: 'true',
        maxRetries: String(this.maxRetries),
        retryCount: String(this.state.retryCount),
      },
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });

    this.props.onError?.(error, {
      componentStack: errorInfo.componentStack ?? undefined,
    });

    const debugInfo: IErrorDebugInfo = {
      context: {
        componentStack: errorInfo.componentStack,
        maxRetries: this.maxRetries,
        retryCount: this.state.retryCount,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent:
          typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      },
      errorCode: 'ERROR_BOUNDARY',
      message: error.message || 'An unexpected error occurred',
      onRetry:
        this.state.retryCount < this.maxRetries ? this.handleRetry : undefined,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    };

    setErrorDebugInfo(debugInfo);

    if (!EnvironmentService.isProduction) {
      if (typeof window !== 'undefined') {
        openModal(ModalEnum.ERROR_DEBUG);
      }
    }
  }

  private handleRetry = () => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState((prevState) => ({
        errorMessage: undefined,
        errorStack: undefined,
        hasError: false,
        retryCount: prevState.retryCount + 1,
      }));

      closeModal(ModalEnum.ERROR_DEBUG);
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(
            new Error(
              this.state.errorMessage || 'An unexpected error occurred',
            ),
            { componentStack: this.state.errorStack },
          );
        }
        return this.props.fallback;
      }

      return (
        <div className="fixed inset-0 flex items-center justify-center bg-card z-40">
          <div className="flex flex-col items-center justify-center p-8 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-4 text-center">
              Something went wrong
            </h1>

            <p className="text-base text-foreground/70 mb-4 text-center">
              {this.state.errorMessage || 'An unexpected error occurred'}
            </p>
            {this.state.retryCount < this.maxRetries && (
              <Button
                withWrapper={false}
                variant={ButtonVariant.DEFAULT}
                onClick={this.handleRetry}
                ariaLabel="Try again"
              >
                Try Again
              </Button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
