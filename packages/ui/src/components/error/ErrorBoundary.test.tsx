/**
 * @vitest-environment jsdom
 */
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

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
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
});
