import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AnalyticsAccountDetail from './analytics-account-detail';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cred-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({ dateRange: {}, filters: {} }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getAccountAnalyticsDetail: vi.fn().mockResolvedValue({
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
  }),
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({ brandId: 'brand-1' }),
}));

describe('AnalyticsAccountDetail', () => {
  it('renders trend and top posts for the exact account', async () => {
    render(<AnalyticsAccountDetail />);

    expect(await screen.findByText('2026-09-01')).toBeInTheDocument();
    expect(await screen.findByText('Winner')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Manage account' }),
    ).toBeInTheDocument();
  });
});
