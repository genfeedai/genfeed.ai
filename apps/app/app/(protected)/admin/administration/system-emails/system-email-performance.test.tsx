import type { IEmailPerformanceReport } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemEmailPerformance from './system-email-performance';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  getPerformance: vi.fn(),
  getService: vi.fn(),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@ui/overview/WorkspaceSurface', () => ({
  WorkspaceSurface: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@ui/display/skeleton/skeleton', () => ({
  SkeletonCard: () => 'Loading report',
}));

const emptyReport: IEmailPerformanceReport = {
  id: 'report',
  from: '2026-08-01T00:00:00Z',
  to: '2026-09-01T00:00:00Z',
  asOf: '2026-09-01T00:00:00Z',
  rows: [],
};

describe('SystemEmailPerformance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getService.mockResolvedValue({
      getPerformance: mocks.getPerformance,
    });
    mocks.getPerformance.mockResolvedValue(emptyReport);
  });

  it('shows the empty cohort and cancels its request on unmount', async () => {
    const { unmount } = render(<SystemEmailPerformance />);
    expect(
      await screen.findByText('No tracked emails were queued in this period'),
    ).toBeInTheDocument();
    const signal = mocks.getPerformance.mock.calls[0][1];
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('retries a failed report without changing the selected cohort', async () => {
    mocks.getPerformance.mockRejectedValueOnce(new Error('offline'));
    render(<SystemEmailPerformance />);
    expect(
      await screen.findByText('Email performance could not be loaded.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry report' }));
    expect(
      await screen.findByText('No tracked emails were queued in this period'),
    ).toBeInTheDocument();
    expect(mocks.getPerformance.mock.calls[1][0]).toEqual(
      mocks.getPerformance.mock.calls[0][0],
    );
  });

  it('applies inclusive UTC calendar days and aborts the preceding request', async () => {
    render(<SystemEmailPerformance />);
    await screen.findByText('No tracked emails were queued in this period');
    const previousSignal = mocks.getPerformance.mock.calls[0][1];
    fireEvent.change(screen.getByLabelText('From (UTC)'), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText('Through (UTC)'), {
      target: { value: '2026-08-31' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Apply dates' }));
    await waitFor(() =>
      expect(mocks.getPerformance).toHaveBeenLastCalledWith(
        {
          from: '2026-08-01T00:00:00.000Z',
          to: '2026-09-01T00:00:00.000Z',
        },
        expect.any(AbortSignal),
      ),
    );
    expect(previousSignal.aborted).toBe(true);
  });

  it('prevents an excessive date range from reaching the report API', async () => {
    render(<SystemEmailPerformance />);
    await screen.findByText('No tracked emails were queued in this period');
    fireEvent.change(screen.getByLabelText('From (UTC)'), {
      target: { value: '2025-01-01' },
    });
    fireEvent.change(screen.getByLabelText('Through (UTC)'), {
      target: { value: '2026-08-31' },
    });
    expect(screen.getByRole('button', { name: 'Apply dates' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a date range of 1–90 days.',
    );
    expect(mocks.getPerformance).toHaveBeenCalledTimes(1);
  });

  it('states the accepted-message denominator and avoids treating opens as proof of action', async () => {
    mocks.getPerformance.mockResolvedValue({
      ...emptyReport,
      rows: [
        {
          templateKey: 'custom-template',
          queued: 12,
          accepted: 10,
          delivered: 8,
          bounced: 1,
          complained: 0,
          opened: 6,
          clicked: 4,
          converted: 2,
        },
      ],
    });
    render(<SystemEmailPerformance />);
    expect(await screen.findByText('custom-template')).toBeInTheDocument();
    expect(screen.getByText('80.0% of accepted')).toBeInTheDocument();
    expect(screen.getByText('40.0% of accepted')).toBeInTheDocument();
    expect(screen.getByText('20.0% of accepted')).toBeInTheDocument();
    expect(screen.getByText('Opens (approx.)')).toBeInTheDocument();
    expect(screen.getByText(/not causal lift/)).toBeInTheDocument();
  });
});
