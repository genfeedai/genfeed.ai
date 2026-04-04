import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  EmptyState,
  ErrorScreen,
  LoadingScreen,
} from '@/components/ScreenStates';

describe('ScreenStates', () => {
  it('renders the loading message', () => {
    render(<LoadingScreen message="Loading content" color="#fff" />);

    expect(screen.getByText('Loading content')).toBeTruthy();
  });

  it('renders an error state with retry action', () => {
    const onRetry = vi.fn();

    render(
      <ErrorScreen
        message="Fetch failed"
        subMessage="Please try again."
        onRetry={onRetry}
        retryLabel="Retry now"
      />,
    );

    expect(screen.getByText('Fetch failed')).toBeTruthy();
    expect(screen.getByText('Please try again.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders an empty state with emoji and supporting copy', () => {
    render(
      <EmptyState
        title="No ideas yet"
        message="Create your first idea to get started."
        emoji="💡"
      />,
    );

    expect(screen.getByText('💡')).toBeTruthy();
    expect(screen.getByText('No ideas yet')).toBeTruthy();
    expect(
      screen.getByText('Create your first idea to get started.'),
    ).toBeTruthy();
  });
});
