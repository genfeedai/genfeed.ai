import { fireEvent, render, screen } from '@testing-library/react';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { describe, expect, it, vi } from 'vitest';

describe('ErrorBoundary', () => {
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
});
