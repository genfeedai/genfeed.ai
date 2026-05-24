import { fireEvent, render, screen } from '@testing-library/react';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from '@/components/ErrorBoundary';
import ScreenErrorBoundary from '@/components/ScreenErrorBoundary';

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a custom fallback when provided', () => {
    function ThrowingChild(): ReactNode {
      throw new Error('Crash');
    }

    render(
      <ErrorBoundary fallback={<Text>Custom fallback</Text>}>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Custom fallback')).toBeTruthy();
  });

  it('shows details, reports errors, and retries successfully', () => {
    const onError = vi.fn();
    let shouldThrow = true;

    function TransientFailure(): ReactNode {
      if (shouldThrow) {
        throw new Error('Transient failure');
      }

      return <Text>Recovered</Text>;
    }

    render(
      <ErrorBoundary onError={onError} showDetails>
        <TransientFailure />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Transient failure')).toBeTruthy();
    expect(onError).toHaveBeenCalledTimes(1);

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(screen.getByText('Recovered')).toBeTruthy();
  });
});

describe('ScreenErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supports go back and retry actions from the screen fallback', () => {
    const router = {
      back: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
    };
    let shouldThrow = true;

    vi.mocked(useRouter).mockReturnValue(
      router as unknown as ReturnType<typeof useRouter>,
    );

    function TransientFailure(): ReactNode {
      if (shouldThrow) {
        throw new Error('Screen failed');
      }

      return <Text>Recovered screen</Text>;
    }

    render(
      <ScreenErrorBoundary>
        <TransientFailure />
      </ScreenErrorBoundary>,
    );

    expect(screen.getByText('Oops!')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    expect(router.back).toHaveBeenCalledTimes(1);

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(screen.getByText('Recovered screen')).toBeTruthy();
  });
});
