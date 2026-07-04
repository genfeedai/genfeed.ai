import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceError from './error';

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

describe('workspace error boundary', () => {
  it('renders a visible retry fallback and reports the segment error', async () => {
    const reset = vi.fn();
    const error = new Error('workspace exploded');

    render(<WorkspaceError error={error} reset={reset} />);

    expect(screen.getByText('Something went wrong')).toBeVisible();
    expect(
      screen.getByText('The workspace could not finish loading. Try again.'),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Workspace route segment error',
        expect.objectContaining({ error }),
      );
      expect(mocks.captureException).toHaveBeenCalledWith(error);
    });
  });
});
