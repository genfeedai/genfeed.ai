import '@testing-library/jest-dom/vitest';
import { ModalEnum } from '@genfeedai/contracts';
import {
  closeModal,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import { deferredLogger } from '@genfeedai/services/core/deferred-logger';
import { setErrorDebugInfo } from '@genfeedai/services/core/error-debug-store';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Button } from '@ui/primitives/button';
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
vi.mock('@genfeedai/services/core/deferred-logger', () => ({
  deferredLogger: { error: vi.fn() },
}));

let pageError = new Error('Test error');
let hasPageError = true;

function PageThrower() {
  if (hasPageError) throw pageError;
  return <div>Recovered</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    environment.isProduction = false;
    pageError = new Error('Test error');
    hasPageError = true;
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
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <PageThrower />
      </ErrorBoundary>,
    );

    // ErrorBoundary should render error UI
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('should render retry button on error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <PageThrower />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
  it('limits retries to three attempts and reports each failure once', () => {
    const onError = vi.fn();
    pageError = new Error('Repeated failure');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary onError={onError}>
        <PageThrower />
      </ErrorBoundary>,
    );

    for (let retry = 0; retry < 3; retry += 1) {
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    }

    expect(onError).toHaveBeenCalledTimes(4);
    expect(deferredLogger.error).toHaveBeenCalledTimes(4);
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
    pageError = failure;
    const fallback = vi.fn(() => <div>Custom fallback</div>);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={fallback}>
        <PageThrower />
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
    pageError = new Error('Debug failure');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <PageThrower />
      </ErrorBoundary>,
    );
    expect(openModal).toHaveBeenCalledExactlyOnceWith(ModalEnum.ERROR_DEBUG);
    expect(setErrorDebugInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        onRetry: expect.any(Function),
        context: expect.objectContaining({ retryCount: 0 }),
      }),
    );
    hasPageError = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('Recovered')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('records production failures without opening the debug modal', () => {
    environment.isProduction = true;
    pageError = new Error('Production failure');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <PageThrower />
      </ErrorBoundary>,
    );
    expect(setErrorDebugInfo).toHaveBeenCalledTimes(1);
    expect(openModal).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

let shouldThrow = false;

function Thrower() {
  if (shouldThrow) {
    throw new Error('Test');
  }
  return <div>OK</div>;
}

describe('inline ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = false;
    vi.clearAllMocks();
    console.error = vi.fn();
  });

  it('renders children', () => {
    render(
      <ErrorBoundary presentation="inline">
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('shows fallback on error', () => {
    shouldThrow = true;
    render(
      <ErrorBoundary presentation="inline">
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('marks the caught fallback for the route smoke suite (#5070)', () => {
    // Route smoke checks only look for the framework's own error overlay,
    // which never fires here — the boundary caught this exception, so the
    // page looks "normal" to that check alone. This marker is how the smoke
    // helper (assertNoErrorBoundaryFallback) tells the two apart.
    shouldThrow = true;
    render(
      <ErrorBoundary presentation="inline">
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeTruthy();
  });

  it('does not mark children when nothing has thrown', () => {
    shouldThrow = false;
    render(
      <ErrorBoundary presentation="inline">
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.queryByTestId('error-boundary-fallback')).toBeNull();
  });

  it('marks a custom fallback render prop the same way as the default one', () => {
    shouldThrow = true;
    render(
      <ErrorBoundary
        presentation="inline"
        fallback={() => <div>Custom fallback</div>}
      >
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeTruthy();
    expect(screen.getByText('Custom fallback')).toBeTruthy();
  });

  it('retry resets', () => {
    shouldThrow = true;
    render(
      <ErrorBoundary presentation="inline">
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    // Stop throwing before clicking retry
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('calls onError', () => {
    const fn = vi.fn();
    shouldThrow = true;
    render(
      <ErrorBoundary presentation="inline" onError={fn}>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(fn).toHaveBeenCalled();
  });
  it('keeps the simple boundary retryable after more than three failures', async () => {
    shouldThrow = true;
    render(
      <ErrorBoundary presentation="inline">
        <Thrower />
      </ErrorBoundary>,
    );
    for (let retry = 0; retry < 4; retry += 1) {
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /try again/i }),
        ).toBeEnabled(),
      );
    }
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('reports through the deferred logger when no reporter is passed', () => {
    shouldThrow = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary presentation="inline">
        <Thrower />
      </ErrorBoundary>,
    );

    expect(deferredLogger.error).toHaveBeenCalledWith(
      '[ErrorBoundary]',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });
});

describe('canonical boundary recovery contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldThrow = true;
    hasPageError = true;
    pageError = new Error('Page recovery');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('recovers inline through a custom fallback and preserves reset/report hooks', () => {
    const onReset = vi.fn();
    const reportError = vi.fn();
    render(
      <ErrorBoundary
        presentation="inline"
        onReset={onReset}
        reportError={reportError}
        fallback={({ error, retryCount, canRetry, resetErrorBoundary }) => (
          <Button
            withWrapper={false}
            onClick={resetErrorBoundary}
            isDisabled={!canRetry}
          >
            Recover {error.message} after {retryCount} attempts
          </Button>
        )}
      >
        <Thrower />
      </ErrorBoundary>,
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'Test' }),
      expect.objectContaining({ componentStack: expect.any(String) }),
      expect.objectContaining({ retryCount: 0, canRetry: true }),
    );
    shouldThrow = false;
    fireEvent.click(
      screen.getByRole('button', { name: 'Recover Test after 0 attempts' }),
    );
    expect(screen.getByText('OK')).toBeVisible();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(deferredLogger.error).not.toHaveBeenCalled();
    expect(setErrorDebugInfo).not.toHaveBeenCalled();
    expect(closeModal).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId('error-boundary-fallback'),
    ).not.toBeInTheDocument();
  });

  it('honors an explicit inline retry limit and localized fallback copy', async () => {
    const onReset = vi.fn();
    render(
      <ErrorBoundary
        presentation="inline"
        maxRetries={1}
        onReset={onReset}
        title="Draft unavailable"
        description="Retry loading this draft."
      >
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Draft unavailable')).toBeVisible();
    expect(screen.getByText('Retry loading this draft.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /try again/i })).toBeNull(),
    );
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(setErrorDebugInfo).not.toHaveBeenCalled();
  });

  it('recovers through the debug modal retry action with a custom page fallback', () => {
    render(
      <ErrorBoundary fallback={<div>Page needs recovery</div>}>
        <PageThrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Page needs recovery')).toBeVisible();
    expect(screen.getByTestId('error-boundary-fallback')).toBeVisible();
    const debugInfo = vi.mocked(setErrorDebugInfo).mock.calls.at(-1)?.[0];
    expect(debugInfo?.onRetry).toBeTypeOf('function');
    hasPageError = false;
    act(() => debugInfo?.onRetry?.());
    expect(screen.getByText('Recovered')).toBeVisible();
    expect(closeModal).toHaveBeenCalledExactlyOnceWith(ModalEnum.ERROR_DEBUG);
  });
});
