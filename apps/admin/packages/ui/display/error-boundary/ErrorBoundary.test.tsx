import { render, screen } from '@testing-library/react';
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
});
