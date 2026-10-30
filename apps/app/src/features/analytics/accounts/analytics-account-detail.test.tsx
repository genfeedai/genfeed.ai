import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsAccountDetail from './analytics-account-detail';

const requestState = vi.hoisted(() => ({
  detailError: false,
  hasMetrics: false,
}));
const mocks = vi.hoisted(() => ({ getAccountAnalyticsDetail: vi.fn() }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cred-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
  }),
}));

vi.mock('@pages/posts/detail/PostDetailPanel', () => ({
  __esModule: true,
  default: ({ postId }: { postId: string | null }) => (
    <div data-testid="post-detail-panel">{postId ?? 'closed'}</div>
  ),
}));

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({ dateRange: {}, filters: {} }),
}));

const getService = async () => ({
  getAccountAnalyticsDetail: mocks.getAccountAnalyticsDetail.mockImplementation(
    () =>
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
              manageHref: '/settings/connected-accounts?credential=cred-1',
              platform: 'instagram',
            },
            metrics: requestState.hasMetrics
              ? ['views', 'posts', 'followers'].map((metric) => ({
                  metric,
                  availability: 'observed',
                  change: 0,
                }))
              : [],
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

describe('AnalyticsAccountDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestState.detailError = false;
    requestState.hasMetrics = false;
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

  it('opens a top post in the sidebar from the row and links its name to the post page', async () => {
    render(<AnalyticsAccountDetail />);

    const link = await screen.findByRole('link', { name: 'Winner' });
    expect(link).toHaveAttribute(
      'href',
      '/acme/moonrise/publishing/posts/post-1',
    );

    fireEvent.click(link);
    expect(screen.getByTestId('post-detail-panel')).toHaveTextContent('closed');

    fireEvent.click(screen.getByText('90'));
    expect(screen.getByTestId('post-detail-panel')).toHaveTextContent('post-1');
  });

  it('renders an error instead of empty account metrics when loading fails', async () => {
    requestState.detailError = true;

    render(<AnalyticsAccountDetail />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Account analytics could not be loaded.',
    );
    expect(screen.queryByText('Top posts')).not.toBeInTheDocument();
  });
  it('annotates supported dynamic zero metrics and top content, leaving followers undefined', async () => {
    requestState.hasMetrics = true;
    render(<AnalyticsAccountDetail />);
    await screen.findByText('Winner');
    expect(screen.getAllByRole('button', { name: 'About Views' })).toHaveLength(
      2,
    );
    expect(
      screen.getByRole('button', { name: 'About Posts' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'About Likes' }),
    ).toBeInTheDocument();
    expect(screen.getByText('followers')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'About Followers' }),
    ).toBeNull();
  });
});
