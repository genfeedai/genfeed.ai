import '@testing-library/jest-dom/vitest';
import { ReleaseStatus } from '@genfeedai/contracts';
import type { RecurrencePreviewResult } from '@genfeedai/contracts/api-types/contracts';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { InputHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvergreenSeriesControls from './evergreen-series-controls';

const mocks = vi.hoisted(() => ({
  cancelFuture: vi.fn(),
  editFuture: vi.fn(),
  getService: vi.fn(),
  getOne: vi.fn(),
  notificationError: vi.fn(),
  notificationSuccess: vi.fn(),
  pauseFuture: vi.fn(),
  preview: vi.fn(),
  resumeFuture: vi.fn(),
}));

const recurrence = {
  frequency: 'weekly',
  interval: 1,
  isExhausted: false,
  isPaused: false,
  repeatCount: 1,
  weekdays: [1],
};

const release = {
  id: 'release-1',
  recurrence,
  scheduledAt: '2026-08-03T09:00:00.000Z',
  status: ReleaseStatus.SCHEDULED,
  timezone: 'UTC',
};

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationError,
      success: mocks.notificationSuccess,
    }),
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    isDisabled,
    isLoading,
    label,
    onClick,
  }: {
    isDisabled?: boolean;
    isLoading?: boolean;
    label: string;
    onClick?: () => void;
  }) => (
    <button disabled={isDisabled || isLoading} onClick={onClick} type="button">
      {label}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('EvergreenSeriesControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getService.mockResolvedValue(mocks);
    mocks.getOne.mockResolvedValue(release);
    mocks.preview.mockResolvedValue({
      isExhausted: false,
      occurrences: ['2026-08-10T09:00:00.000Z', '2026-08-17T09:00:00.000Z'],
      success: true,
    });
    mocks.pauseFuture.mockResolvedValue({
      ...release,
      recurrence: { ...recurrence, isPaused: true },
      status: ReleaseStatus.PAUSED,
    });
    mocks.resumeFuture.mockResolvedValue(release);
    mocks.cancelFuture.mockResolvedValue({
      ...release,
      recurrence: { ...recurrence, isExhausted: true },
    });
    mocks.editFuture.mockResolvedValue(release);
  });

  it('previews upcoming occurrences before pausing the series', async () => {
    render(<EvergreenSeriesControls groupId="release-1" />);

    expect(await screen.findByText('Upcoming preview')).toBeInTheDocument();
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3, timezone: 'UTC' }),
      expect.any(AbortSignal),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pause series' }));

    await waitFor(() => {
      expect(mocks.pauseFuture).toHaveBeenCalledWith('release-1');
      expect(screen.getByText(/Paused/)).toBeInTheDocument();
    });
  });

  it('resumes a paused series without replacing its history', async () => {
    mocks.getOne.mockResolvedValue({
      ...release,
      recurrence: { ...recurrence, isPaused: true },
      status: ReleaseStatus.PAUSED,
    });

    render(<EvergreenSeriesControls groupId="release-1" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resume series' }),
    );

    await waitFor(() => {
      expect(mocks.resumeFuture).toHaveBeenCalledWith('release-1');
      expect(mocks.notificationSuccess).toHaveBeenCalledWith(
        'Evergreen series resumed',
      );
    });
  });

  it('requires confirmation before cancelling future occurrences', async () => {
    render(<EvergreenSeriesControls groupId="release-1" />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Cancel future occurrences',
      }),
    );
    expect(mocks.cancelFuture).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm cancellation' }),
    );

    await waitFor(() => {
      expect(mocks.cancelFuture).toHaveBeenCalledWith('release-1');
      expect(screen.getByText(/Series complete/)).toBeInTheDocument();
    });
  });

  it('clears cancellation confirmation when the release group changes', async () => {
    const { rerender } = render(
      <EvergreenSeriesControls groupId="release-1" />,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Cancel future occurrences',
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Confirm cancellation' }),
    ).toBeInTheDocument();

    rerender(<EvergreenSeriesControls groupId="release-2" />);

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Confirm cancellation' }),
      ).not.toBeInTheDocument();
    });
    expect(mocks.cancelFuture).not.toHaveBeenCalled();
  });

  it('renders empty, exhausted, and error states explicitly', async () => {
    mocks.getOne.mockResolvedValueOnce({ ...release, recurrence: null });
    const { rerender, unmount } = render(
      <EvergreenSeriesControls groupId="one-off" />,
    );
    expect(await screen.findByText('One-off post')).toBeInTheDocument();

    mocks.getOne.mockResolvedValueOnce({
      ...release,
      recurrence: { ...recurrence, isExhausted: true },
    });
    rerender(<EvergreenSeriesControls groupId="exhausted" />);
    expect(await screen.findByText(/Series complete/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Pause series' }),
    ).not.toBeInTheDocument();

    unmount();
    mocks.getOne.mockRejectedValueOnce(new Error('Network unavailable'));
    render(<EvergreenSeriesControls groupId="error" />);
    expect(
      await screen.findByText('Series controls unavailable'),
    ).toBeInTheDocument();
    expect(screen.getByText('Network unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('edits the next future occurrence through the dedicated command', async () => {
    render(<EvergreenSeriesControls groupId="release-1" />);

    const dateInput = await screen.findByLabelText('Next occurrence');
    fireEvent.change(dateInput, { target: { value: '2026-08-12T09:00' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save future schedule' }),
    );

    await waitFor(() => {
      expect(mocks.editFuture).toHaveBeenCalledWith('release-1', {
        scheduledDate: '2026-08-12T09:00:00.000Z',
      });
    });
  });

  it('preserves the release timezone for display, preview, and edits', async () => {
    mocks.getOne.mockResolvedValue({
      ...release,
      scheduledAt: '2026-08-03T13:00:00.000Z',
      timezone: 'America/New_York',
    });

    render(<EvergreenSeriesControls groupId="release-1" />);

    const dateInput = await screen.findByLabelText('Next occurrence');
    expect(dateInput).toHaveValue('2026-08-03T09:00');
    await waitFor(() => {
      expect(mocks.preview).toHaveBeenCalledWith(
        expect.objectContaining({
          startAt: '2026-08-03T13:00:00.000Z',
          timezone: 'America/New_York',
        }),
        expect.any(AbortSignal),
      );
    });

    fireEvent.change(dateInput, { target: { value: '2026-08-12T09:00' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save future schedule' }),
    );

    await waitFor(() => {
      expect(mocks.editFuture).toHaveBeenCalledWith('release-1', {
        scheduledDate: '2026-08-12T13:00:00.000Z',
      });
    });
  });

  it('aborts and ignores a stale release response after the group changes', async () => {
    const firstRelease = createDeferred<typeof release>();
    const secondRelease = createDeferred<typeof release>();
    mocks.getOne.mockImplementation((groupId: string) =>
      groupId === 'release-1' ? firstRelease.promise : secondRelease.promise,
    );

    const { rerender } = render(
      <EvergreenSeriesControls groupId="release-1" />,
    );
    await waitFor(() => expect(mocks.getOne).toHaveBeenCalledTimes(1));
    const firstSignal = mocks.getOne.mock.calls[0]?.[1] as AbortSignal;

    rerender(<EvergreenSeriesControls groupId="release-2" />);
    await waitFor(() => expect(mocks.getOne).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);

    await act(async () => {
      secondRelease.resolve({
        ...release,
        id: 'release-2',
        scheduledAt: '2026-08-04T10:00:00.000Z',
      });
    });
    expect(await screen.findByLabelText('Next occurrence')).toHaveValue(
      '2026-08-04T10:00',
    );

    await act(async () => {
      firstRelease.resolve(release);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Next occurrence')).toHaveValue(
        '2026-08-04T10:00',
      );
    });
  });

  it('aborts and ignores a stale preview after the schedule changes', async () => {
    const firstPreview = createDeferred<RecurrencePreviewResult>();
    const secondPreview = createDeferred<RecurrencePreviewResult>();
    mocks.preview
      .mockReset()
      .mockImplementationOnce(() => firstPreview.promise)
      .mockImplementationOnce(() => secondPreview.promise);

    render(<EvergreenSeriesControls groupId="release-1" />);
    const dateInput = await screen.findByLabelText('Next occurrence');
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1));
    const firstSignal = mocks.preview.mock.calls[0]?.[1] as AbortSignal;

    fireEvent.change(dateInput, { target: { value: '2026-08-03T10:00' } });
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);

    const currentOccurrence = '2026-08-10T10:00:00.000Z';
    await act(async () => {
      secondPreview.resolve({
        isExhausted: false,
        occurrences: [currentOccurrence],
        success: true,
      });
    });
    expect(
      await screen.findByText(new Date(currentOccurrence).toLocaleString()),
    ).toBeInTheDocument();

    const staleOccurrence = '2026-08-10T09:00:00.000Z';
    await act(async () => {
      firstPreview.resolve({
        isExhausted: false,
        occurrences: [staleOccurrence],
        success: true,
      });
    });
    await waitFor(() => {
      expect(
        screen.queryByText(new Date(staleOccurrence).toLocaleString()),
      ).not.toBeInTheDocument();
    });
  });
});
