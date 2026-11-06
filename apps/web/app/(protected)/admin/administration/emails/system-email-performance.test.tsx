import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { IEmailPerformanceReport } from '@genfeedai/contracts/interfaces';
import type { QueryClient } from '@tanstack/react-query';
import {
  render as renderWithoutClient,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren, ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemEmailPerformance from './system-email-performance';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({
  getPerformance: vi.fn(),
  getService: vi.fn(),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@/components/overview/WorkspaceSurface', () => ({
  WorkspaceSurface: ({ children }: PropsWithChildren) => children,
}));
vi.mock('@ui/display/skeleton/skeleton', () => ({
  SkeletonCard: () => 'Loading report',
}));

function render(ui: ReactElement, client?: QueryClient) {
  return renderWithoutClient(ui, { wrapper: queryClientWrapper(client) });
}

const query = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-09-01T00:00:00.000Z',
};

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

  it('shows the empty cohort', async () => {
    render(<SystemEmailPerformance query={query} />);
    expect(
      await screen.findByText('No tracked emails were queued in this period'),
    ).toBeInTheDocument();
  });

  it('cancels a report still loading when it unmounts', async () => {
    mocks.getPerformance.mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<SystemEmailPerformance query={query} />);
    await waitFor(() => expect(mocks.getPerformance).toHaveBeenCalled());
    const signal = mocks.getPerformance.mock.calls[0][1];
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('retries a failed report without changing the selected cohort', async () => {
    mocks.getPerformance.mockRejectedValueOnce(new Error('offline'));
    render(<SystemEmailPerformance query={query} />);
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
    render(<SystemEmailPerformance query={query} />);
    expect(await screen.findByText('custom-template')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
    expect(screen.getByText('20.0%')).toBeInTheDocument();
    expect(screen.getAllByText('% of accepted')).toHaveLength(3);
    expect(screen.getByText('Opens (approx.)')).toBeInTheDocument();
    expect(screen.getByText(/not causal lift/)).toBeInTheDocument();
  });

  it('paints the cached report at once when the page is revisited', async () => {
    mocks.getPerformance.mockResolvedValue({
      ...emptyReport,
      rows: [
        {
          accepted: 10,
          bounced: 1,
          clicked: 4,
          complained: 0,
          converted: 2,
          delivered: 8,
          opened: 6,
          queued: 12,
          templateKey: 'custom-template',
        },
      ],
    });
    const client = createTestQueryClient();
    const first = render(<SystemEmailPerformance query={query} />, client);
    expect(await screen.findByText('custom-template')).toBeInTheDocument();
    first.unmount();

    mocks.getPerformance.mockReturnValue(new Promise(() => {}));
    render(<SystemEmailPerformance query={query} />, client);

    expect(screen.getByText('custom-template')).toBeInTheDocument();
    expect(screen.queryByText('Loading report')).not.toBeInTheDocument();
    // The cached report is stale, so the revisit refreshes it behind it.
    await waitFor(() => expect(mocks.getPerformance).toHaveBeenCalledTimes(2));
  });
});
