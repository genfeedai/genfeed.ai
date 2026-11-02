import { paginatedResponse } from '@app-tests/paginated-response';
// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { PagesService } from '@services/content/pages.service';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReferralRewardsList from './referral-rewards-list';

const { getAdminRewardsMock, urlState } = vi.hoisted(() => ({
  getAdminRewardsMock: vi.fn(),
  urlState: { query: 'page=2' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(urlState.query),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: ({ totals }: { totals?: { totalDocs: number } }) => (
    <nav aria-label="pagination">{totals?.totalDocs ?? '?'} rewards</nav>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      adminLoadErrorDescription:
        'Financial reward records could not be loaded.',
      loadErrorTitle: 'Affiliate rewards unavailable',
      retry: 'Retry',
    })[key] ?? key,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getAdminRewards: getAdminRewardsMock,
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} type="button">
      Refresh
    </button>
  ),
}));

vi.mock('@ui/primitives/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    emptyLabel,
    items,
  }: {
    emptyLabel: string;
    items: unknown[];
  }) => <div>{items.length > 0 ? 'Reward rows' : emptyLabel}</div>,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    label,
    right,
  }: {
    children: ReactNode;
    label: string;
    right?: ReactNode;
  }) => (
    <section>
      <h1>{label}</h1>
      {right}
      {children}
    </section>
  ),
}));

describe('ReferralRewardsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    urlState.query = 'page=2';
    getAdminRewardsMock.mockResolvedValue(paginatedResponse([]));
  });

  it('shows the read failure instead of an empty table, then retries', async () => {
    getAdminRewardsMock.mockRejectedValueOnce(new Error('API unavailable'));

    render(<ReferralRewardsList />, { wrapper: queryClientWrapper() });

    expect(
      await screen.findByText('Affiliate rewards unavailable'),
    ).toBeVisible();
    expect(screen.queryByText('No referral rewards found')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No referral rewards found')).toBeVisible();
  });

  it('paints the cached page with its own footer total when coming back', async () => {
    getAdminRewardsMock.mockImplementation(async () => {
      return paginatedResponse([{ id: 'reward-1' }], {
        totalDocs: 42,
        totalPages: 3,
      });
    });
    const client = createTestQueryClient();
    const firstVisit = render(<ReferralRewardsList />, {
      wrapper: queryClientWrapper(client),
    });
    expect(await screen.findByText('Reward rows')).toBeVisible();
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveTextContent('42 rewards');
    firstVisit.unmount();

    PagesService.recordTotals({ page: 1, pages: 9, total: 200 });
    getAdminRewardsMock.mockReturnValue(new Promise(() => {}));
    render(<ReferralRewardsList />, { wrapper: queryClientWrapper(client) });

    expect(screen.getByText('Reward rows')).toBeVisible();
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveTextContent('42 rewards');
  });

  it('requests the page from the URL and shows the pager', async () => {
    render(<ReferralRewardsList />, { wrapper: queryClientWrapper() });

    await waitFor(() =>
      expect(getAdminRewardsMock).toHaveBeenCalledWith({ limit: 15, page: 2 }),
    );
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeVisible();
  });

  it.each([
    ['status', 'status: 1'],
    ['-netAmountCents', 'netAmountCents: -1'],
    ['-eligibleAt', 'eligibleAt: -1'],
    ['attemptCount', 'attemptCount: 1'],
  ])('sorts the request by ?sort=%s', async (urlSort, apiSort) => {
    urlState.query = `page=2&sort=${urlSort}`;
    render(<ReferralRewardsList />, { wrapper: queryClientWrapper() });

    await waitFor(() =>
      expect(getAdminRewardsMock).toHaveBeenCalledWith({
        limit: 15,
        page: 2,
        sort: apiSort,
      }),
    );
  });

  it('ignores a sort on a column the API cannot order by', async () => {
    urlState.query = 'page=2&sort=-referrerBillingAccountId';
    render(<ReferralRewardsList />, { wrapper: queryClientWrapper() });

    await waitFor(() =>
      expect(getAdminRewardsMock).toHaveBeenCalledWith({ limit: 15, page: 2 }),
    );
  });
});
