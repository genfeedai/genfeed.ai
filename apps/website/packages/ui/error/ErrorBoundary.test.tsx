/**
 * @vitest-environment jsdom
 *
 * SKIPPED: @testing-library/react 16.x uses React.act() which doesn't exist
 * in React 19 (moved from react-dom/test-utils). Needs @testing-library/react
 * upgrade to v17+ or React 19 compat shim.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@ui/error/ErrorBoundary';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let shouldThrow = false;

function Thrower() {
  if (shouldThrow) {
    throw new Error('Test');
  }
  return <div>OK</div>;
}

// TODO: Unskip after upgrading @testing-library/react to v17+ (React 19 compat)
describe.skip('ErrorBoundary', () => {
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
});
