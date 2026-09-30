/**
 * @vitest-environment jsdom
 */

import { deferredLogger } from '@genfeedai/services/core/deferred-logger';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ErrorBoundary } from '@ui/error/ErrorBoundary';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let shouldThrow = false;

function Thrower() {
  if (shouldThrow) {
    throw new Error('Test');
  }
  return <div>OK</div>;
}

vi.mock('@genfeedai/services/core/deferred-logger', () => ({
  deferredLogger: { error: vi.fn() },
}));

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = false;
    console.error = vi.fn();
  });

  it('renders children', () => {
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('shows fallback on error', () => {
    shouldThrow = true;
    render(
      <ErrorBoundary>
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
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeTruthy();
  });

  it('does not mark children when nothing has thrown', () => {
    shouldThrow = false;
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.queryByTestId('error-boundary-fallback')).toBeNull();
  });

  it('marks a custom fallback render prop the same way as the default one', () => {
    shouldThrow = true;
    render(
      <ErrorBoundary fallback={() => <div>Custom fallback</div>}>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeTruthy();
    expect(screen.getByText('Custom fallback')).toBeTruthy();
  });

  it('retry resets', () => {
    shouldThrow = true;
    render(
      <ErrorBoundary>
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
      <ErrorBoundary onError={fn}>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(fn).toHaveBeenCalled();
  });
  it('keeps the simple boundary retryable after more than three failures', async () => {
    shouldThrow = true;
    render(
      <ErrorBoundary>
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
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(deferredLogger.error).toHaveBeenCalledWith(
      '[ErrorBoundary]',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });
});
