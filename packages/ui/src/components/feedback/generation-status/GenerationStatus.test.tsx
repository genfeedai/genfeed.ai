import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GenerationStatus from './GenerationStatus';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

afterEach(() => vi.useRealTimers());

describe('GenerationStatus', () => {
  it('shows elapsed time without announcing each tick as a status update', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T10:00:00Z'));
    render(
      <GenerationStatus
        status="generating"
        assetLabel="video"
        startedAt={Date.now() - 65000}
      />,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Creating video');
    expect(screen.getByLabelText('1:05 elapsed')).toBeVisible();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByLabelText('1:06 elapsed')).toBeVisible();
    expect(status).not.toHaveTextContent('1:06');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it.each([undefined, Number.NaN, -1, 101])(
    'omits invalid or unavailable progress %s',
    (progress) => {
      render(<GenerationStatus status="generating" progress={progress} />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    },
  );

  it('exposes real progress and calls the actual cancellation action', () => {
    const cancel = vi.fn();
    render(
      <GenerationStatus
        status="generating"
        assetLabel="image"
        progress={42}
        completedCount={2}
        totalCount={4}
        onCancel={cancel}
      />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '42',
    );
    expect(screen.getByText('2 of 4 ready')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel generation' }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('ends animation and removes cancellation for a terminal state', () => {
    render(
      <GenerationStatus
        status="cancelled"
        assetLabel="video"
        progress={42}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('video cancelled');
    expect(screen.getByRole('status')).not.toHaveClass('animate-text-shimmer');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
