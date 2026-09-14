'use client';

import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import type { IErrorDebugInfo } from '@genfeedai/contracts/interfaces/modals/error-debug.interface';
import type { IErrorBoundaryProps } from '@genfeedai/contracts/interfaces/utils/error.interface';
import {
  closeModal,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import type { ErrorBoundaryProps } from '@genfeedai/props/ui/feedback/error-boundary.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { setErrorDebugInfo } from '@genfeedai/services/core/error-debug-store';
import { logger } from '@genfeedai/services/core/logger.service';
import { ErrorBoundary as SharedErrorBoundary } from '@ui/error/ErrorBoundary';
import { Button } from '@ui/primitives/button';

const MAX_RETRIES = 3;

export default function ErrorBoundary({
  children,
  fallback,
  onError,
}: IErrorBoundaryProps) {
  const reportError: ErrorBoundaryProps['reportError'] = (
    error,
    errorInfo,
    failure,
  ) => {
    logger.error('ErrorBoundary caught an error', {
      componentStack: errorInfo.componentStack,
      error,
      retryCount: failure.retryCount,
      tags: {
        errorBoundary: 'true',
        maxRetries: String(MAX_RETRIES),
        retryCount: String(failure.retryCount),
      },
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
    onError?.(error, { componentStack: errorInfo.componentStack ?? undefined });
    const debugInfo: IErrorDebugInfo = {
      context: {
        componentStack: errorInfo.componentStack,
        maxRetries: MAX_RETRIES,
        retryCount: failure.retryCount,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent:
          typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      },
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
  };

  return (
    <SharedErrorBoundary
      maxRetries={MAX_RETRIES}
      reportError={reportError}
      onReset={() => closeModal(ModalEnum.ERROR_DEBUG)}
      fallback={({ error, canRetry, resetErrorBoundary }) => {
        if (fallback) {
          return typeof fallback === 'function'
            ? fallback(
                new Error(error.message || 'An unexpected error occurred'),
                { componentStack: error.stack },
              )
            : fallback;
        }
        return (
          <div className="fixed inset-0 flex items-center justify-center bg-card z-40">
            <div className="flex flex-col items-center justify-center p-8 max-w-2xl mx-auto">
              <h1 className="text-2xl font-semibold mb-4 text-center">
                Something went wrong
              </h1>
              <p className="text-base text-foreground/70 mb-4 text-center">
                {error.message || 'An unexpected error occurred'}
              </p>
              {canRetry && (
                <Button
                  withWrapper={false}
                  variant={ButtonVariant.DEFAULT}
                  onClick={resetErrorBoundary}
                  ariaLabel="Try again"
                >
                  Try Again
                </Button>
              )}
            </div>
          </div>
        );
      }}
    >
      {children}
    </SharedErrorBoundary>
  );
}
