import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsAccountDetail from './analytics-account-detail';

const requestState = vi.hoisted(() => ({ detailError: false }));
const mocks = vi.hoisted(() => ({ getAccountAnalyticsDetail: vi.fn() }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cred-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({ dateRange: {}, filters: {} }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getAccountAnalyticsDetail:
      mocks.getAccountAnalyticsDetail.mockImplementation(() =>
        requestState.detailError
          ? Promise.reject(new Error('request failed'))
          : Promise.resolve({
              coverage: 1,
              evaluation: null,
              freshnessHours: 1,
              growth: [],
              identity: {
                brandId: 'brand-1',
                brandLabel: 'Brand',
                connectedAt: null,
                credentialId: 'cred-1',
                externalAvatar: null,
                externalHandle: 'acct',
                externalId: 'ext-1',
                externalName: 'Account',
                firstPublishedAt: null,
                firstTrackedAt: null,
                isConnected: true,
                label: 'Account',
                manageHref: '/settings/social?credential=cred-1',
                platform: 'instagram',
              },
              metrics: [],
              publishedPosts: 2,
              series: [{ date: '2026-09-01', metrics: [] }],
              topPosts: [
                {
                  comments: 1,
                  description: '',
                  engagementRate: 1,
                  ingredientId: 'post-1',
                  likes: 4,
                  platform: 'instagram',
                  postId: 'post-1',
                  publishDate: '2026-09-01',
                  shares: 0,
                  title: 'Winner',
                  views: 90,
                },
              ],
            }),
      ),
  }),
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

describe('AnalyticsAccountDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestState.detailError = false;
  });

  it('renders trend and top posts for the exact account', async () => {
    render(<AnalyticsAccountDetail />);

    expect(await screen.findByText('2026-09-01')).toBeInTheDocument();
    expect(await screen.findByText('Winner')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Manage account' }),
    ).toBeInTheDocument();
    expect(mocks.getAccountAnalyticsDetail).toHaveBeenCalledWith(
      'cred-1',
      expect.objectContaining({ organizationId: 'org-1' }),
    );
  });

  it('renders an error instead of empty account metrics when loading fails', async () => {
    requestState.detailError = true;

    render(<AnalyticsAccountDetail />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Account analytics could not be loaded.',
    );
    expect(screen.queryByText('Top posts')).not.toBeInTheDocument();
  });
});
