import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { IAccountAnalytics } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsAccountSummary, {
  toViewsSeries,
} from '@/features/analytics/accounts/analytics-account-summary';

const mocks = vi.hoisted(() => ({ getAccountAnalyticsDetail: vi.fn() }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({ dateRange: {}, refreshTrigger: 0 }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

const getService = async () => ({
  getAccountAnalyticsDetail: mocks.getAccountAnalyticsDetail,
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  isCollectionFetchReady: () => true,
  useCollectionScope: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
    pageScope: 'org',
  }),
}));

const account = {
  identity: { credentialId: 'cred-1' },
} as unknown as IAccountAnalytics;

function viewsPoint(date: string, change: number | null, availability: string) {
  return {
    date,
    metrics: [{ availability, change, lifetime: null, metric: 'views' }],
  };
}

describe('toViewsSeries', () => {
  it('keeps only the days the platform reported', () => {
    expect(
      toViewsSeries([
        viewsPoint('2026-09-01', 10, 'observed'),
        viewsPoint('2026-09-02', null, 'observed'),
        viewsPoint('2026-09-03', 5, 'unavailable'),
        viewsPoint('2026-09-04', 30, 'observed'),
      ] as never),
    ).toEqual([10, 30]);
  });
});

describe('AnalyticsAccountSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccountAnalyticsDetail.mockResolvedValue({
      series: [viewsPoint('2026-09-01', 10, 'observed')],
      topPosts: [
        {
          platform: 'instagram',
          postId: 'post-1',
          title: 'Winner',
          views: 1200,
        },
      ],
    });
  });

  it('shows the account facts and its best posts beyond the row numbers', async () => {
    render(
      <AnalyticsAccountSummary
        account={account}
        facts={[{ id: 'handle', label: 'Handle', value: '@acct' }]}
        openHref="/analytics/accounts/cred-1"
      />,
      { wrapper: queryClientWrapper(createTestQueryClient()) },
    );

    expect(screen.getByText('@acct')).toBeInTheDocument();
    expect(await screen.findByText('Winner')).toBeInTheDocument();
    expect(screen.getByText('1.2K views')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open account analytics' }),
    ).toHaveAttribute('href', '/analytics/accounts/cred-1');
  });

  it('says so when the account has no posts yet', async () => {
    mocks.getAccountAnalyticsDetail.mockResolvedValue({
      series: [],
      topPosts: [],
    });
    render(
      <AnalyticsAccountSummary
        account={account}
        facts={[]}
        openHref="/analytics/accounts/cred-1"
      />,
      { wrapper: queryClientWrapper(createTestQueryClient()) },
    );

    expect(
      await screen.findByText('No published posts yet'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No views reported in this period'),
    ).toBeInTheDocument();
  });
});
