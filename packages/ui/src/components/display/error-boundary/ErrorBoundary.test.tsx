import { ModalEnum } from '@genfeedai/contracts';
import {
  closeModal,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import { setErrorDebugInfo } from '@genfeedai/services/core/error-debug-store';
import { logger } from '@genfeedai/services/core/logger.service';
import { fireEvent, render, screen } from '@testing-library/react';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const environment = vi.hoisted(() => ({ isProduction: false }));
vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: environment,
}));
vi.mock('@genfeedai/services/core/error-debug-store', () => ({
  setErrorDebugInfo: vi.fn(),
}));
vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
  openModal: vi.fn(),
}));
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    environment.isProduction = false;
  });
  it('should render children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Child Content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Child Content')).toBeInTheDocument();
  });

  it('should catch errors and display fallback UI', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };

    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );

    // ErrorBoundary should render error UI
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('should render retry button on error', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
  it('limits retries to three attempts and reports each failure once', () => {
    const onError = vi.fn();
    const ThrowError = () => {
      throw new Error('Repeated failure');
    };
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary onError={onError}>
        <ThrowError />
      </ErrorBoundary>,
    );

    for (let retry = 0; retry < 3; retry += 1) {
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    }

    expect(onError).toHaveBeenCalledTimes(4);
    expect(logger.error).toHaveBeenCalledTimes(4);
    expect(closeModal).toHaveBeenCalledTimes(3);
    expect(closeModal).toHaveBeenLastCalledWith(ModalEnum.ERROR_DEBUG);
    expect(setErrorDebugInfo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        onRetry: undefined,
        context: expect.objectContaining({ retryCount: 3, maxRetries: 3 }),
      }),
    );
    expect(
      screen.queryByRole('button', { name: /try again/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Repeated failure')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('preserves the custom fallback error and stack arguments', () => {
    const failure = new Error('Custom failure');
    const ThrowError = () => {
      throw failure;
    };
    const fallback = vi.fn(() => <div>Custom fallback</div>);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={fallback}>
        <ThrowError />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(fallback).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: failure.message }),
      { componentStack: failure.stack },
    );
    consoleSpy.mockRestore();
  });
  it('opens the debug modal in development and preserves its retry action', () => {
    let shouldThrow = true;
    const ThrowError = () => {
      if (shouldThrow) throw new Error('Debug failure');
      return <div>Recovered</div>;
    };
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );
    expect(openModal).toHaveBeenCalledExactlyOnceWith(ModalEnum.ERROR_DEBUG);
    expect(setErrorDebugInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        onRetry: expect.any(Function),
        context: expect.objectContaining({ retryCount: 0 }),
      }),
    );
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('Recovered')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('records production failures without opening the debug modal', () => {
    environment.isProduction = true;
    const ThrowError = () => {
      throw new Error('Production failure');
    };
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );
    expect(setErrorDebugInfo).toHaveBeenCalledTimes(1);
    expect(openModal).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
