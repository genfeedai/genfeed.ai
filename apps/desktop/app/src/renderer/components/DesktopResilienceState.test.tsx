import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopResilienceState } from './DesktopResilienceState';

describe('DesktopResilienceState', () => {
  it('renders a recoverable desktop state with an action', () => {
    const onAction = vi.fn();

    render(
      <DesktopResilienceState
        actionLabel="Retry"
        details="Cloud data is unavailable."
        kind="error"
        onAction={onAction}
        title="Unable to load"
      />,
    );

    expect(screen.getByText('Unable to load')).toBeInTheDocument();
    expect(screen.getByText('Cloud data is unavailable.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
