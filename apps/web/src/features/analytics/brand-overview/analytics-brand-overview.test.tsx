import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { PostStatus } from '@genfeedai/contracts';
import type { IAnalytics } from '@genfeedai/contracts/interfaces';
import type { Post } from '@models/content/post.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsBrandOverview from '@/features/analytics/brand-overview/analytics-brand-overview';

const pushMock = vi.fn();

const brandPost = {
  description: 'Brand overview post',
  id: 'post-2',
  platform: 'twitter',
  publishedAt: '2026-03-10T10:00:00.000Z',
  status: PostStatus.PUBLIC,
  totalComments: 11,
  totalLikes: 34,
  totalViews: 850,
} as Post;

const analyticsFixture = {
  avgEngagementRate: 4.2,
  engagementGrowth: 6,
  totalEngagement: 90,
  totalLikes: 120,
  totalPosts: 4,
  totalViews: 1800,
  twitter: {
    totalComments: 30,
    totalLikes: 90,
    totalPosts: 4,
    totalShares: 10,
    totalViews: 1800,
  },
  viewsGrowth: 12,
} as unknown as IAnalytics;

const brandsServiceMock = {
  findBrandAnalytics: vi.fn(async (): Promise<IAnalytics> => analyticsFixture),
  findBrandAnalyticsTimeSeries: vi.fn(async (): Promise<unknown[]> => []),
  findBrandCredentials: vi.fn(async () => []),
  findBrandPosts: vi.fn(async (): Promise<Post[]> => [brandPost]),
  findOne: vi.fn(async (): Promise<{ label: string }> => ({ label: 'Acme' })),
};

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function renderOverview(brandId = 'brand-1', client = createTestQueryClient()) {
  return render(<AnalyticsBrandOverview brandId={brandId} />, {
    wrapper: queryClientWrapper(client),
  });
}

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt || ''} />
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="analytics-chart" />,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({
    dateRange: {
      endDate: new Date('2026-03-12T00:00:00.000Z'),
      startDate: new Date('2026-03-01T00:00:00.000Z'),
    },
    refreshTrigger: 0,
  }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: () => brandsServiceMock },
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
  }),
}));

vi.mock('@/features/posts/detail/PostDetailPanel', () => ({
  __esModule: true,
  default: ({ postId }: { postId: string | null }) => (
    <div data-testid="post-detail-overlay">{postId ?? 'closed'}</div>
  ),
}));

vi.mock('@ui/display/table/Table', () => ({
  __esModule: true,
  default: ({
    items,
    onRowClick,
  }: {
    items: Post[];
    onRowClick?: (post: Post) => void;
  }) =>
    // Render the row only once posts have actually loaded, so `waitFor` in the
    // suite blocks on the fetch instead of on a button that exists from the
    // first paint with an empty `items`.
    items.length > 0 ? (
      <button type="button" onClick={() => onRowClick?.(items[0])}>
        Open analytics brand row
      </button>
    ) : null,
}));

describe('AnalyticsBrandOverview', () => {
  beforeEach(() => {
    pushMock.mockReset();
    brandsServiceMock.findBrandAnalytics
      .mockReset()
      .mockResolvedValue(analyticsFixture);
    brandsServiceMock.findBrandAnalyticsTimeSeries
      .mockReset()
      .mockResolvedValue([]);
    brandsServiceMock.findBrandCredentials.mockClear();
    brandsServiceMock.findBrandPosts.mockReset().mockResolvedValue([brandPost]);
    brandsServiceMock.findOne.mockReset().mockResolvedValue({ label: 'Acme' });
  });

  it('paints the cached brand analytics at once when the page is opened again', async () => {
    const client = createTestQueryClient();
    const first = renderOverview('brand-1', client);
    await screen.findByRole('button', { name: /open analytics brand row/i });
    await screen.findByText('Acme Analytics');
    first.unmount();

    brandsServiceMock.findBrandAnalytics.mockReturnValue(never());
    brandsServiceMock.findBrandPosts.mockReturnValue(never());
    brandsServiceMock.findOne.mockReturnValue(never());
    renderOverview('brand-1', client);

    expect(
      screen.getByRole('button', { name: /open analytics brand row/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Acme Analytics')).toBeInTheDocument();
    expect(screen.getAllByTestId('metric-card')[0]).not.toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('never shows another brand the analytics cached for this one', async () => {
    const client = createTestQueryClient();
    const first = renderOverview('brand-1', client);
    await screen.findByRole('button', { name: /open analytics brand row/i });
    first.unmount();

    brandsServiceMock.findBrandAnalytics.mockReturnValue(never());
    brandsServiceMock.findBrandPosts.mockReturnValue(never());
    brandsServiceMock.findOne.mockReturnValue(never());
    renderOverview('brand-2', client);

    expect(
      screen.queryByRole('button', { name: /open analytics brand row/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Brand Analytics')).toBeInTheDocument();
    expect(screen.getAllByTestId('metric-card')[0]).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('opens the shared post detail overlay from the recent posts table', async () => {
    renderOverview();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /open analytics brand row/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /open analytics brand row/i }),
    );

    expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
      'post-2',
    );
  });

  it('shows no zero placeholders before the first fetch resolves', async () => {
    renderOverview();

    // First paint is already the loading state: every KPI tile is busy, so no
    // "0" tiles flip to a skeleton and then to the data.
    expect(screen.getAllByTestId('metric-card')[0]).toHaveAttribute(
      'aria-busy',
      'true',
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /open analytics brand row/i }),
      ).toBeInTheDocument();
    });
  });

  it('keeps analytics section titles outside their framed bodies', () => {
    renderOverview();

    for (const name of [
      'Platform Comparison',
      'Performance Trends',
      'Recent Posts (Top 5)',
    ]) {
      const heading = screen.getByRole('heading', { name });
      const section = heading.closest('section');
      const body = section?.querySelector(
        '[data-slot="workspace-surface-body"]',
      );

      expect(body).toBeInTheDocument();
      expect(body).not.toContainElement(heading);
    }
  });
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
