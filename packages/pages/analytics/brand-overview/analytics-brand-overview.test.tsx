import '@testing-library/jest-dom';
import type { IAnalytics } from '@cloud/interfaces';
import { PostStatus } from '@genfeedai/enums';
import type { Post } from '@models/content/post.model';
import AnalyticsBrandOverview from '@pages/analytics/brand-overview/analytics-brand-overview';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  findBrandAnalytics: vi.fn(async () => analyticsFixture),
  findBrandAnalyticsTimeSeries: vi.fn(async () => []),
  findBrandCredentials: vi.fn(async () => []),
  findBrandPosts: vi.fn(async () => [brandPost]),
  findOne: vi.fn(async () => ({ label: 'Acme' })),
};

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt || ''} />
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="analytics-chart" />,
}));

vi.mock('next/navigation', () => ({
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

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => brandsServiceMock,
}));

vi.mock('@pages/posts/detail/PostDetailOverlay', () => ({
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
  }) => (
    <button
      type="button"
      onClick={() => {
        if (items[0]) {
          onRowClick?.(items[0]);
        }
      }}
    >
      Open analytics brand row
    </button>
  ),
}));

describe('AnalyticsBrandOverview', () => {
  beforeEach(() => {
    pushMock.mockReset();
    brandsServiceMock.findBrandAnalytics.mockClear();
    brandsServiceMock.findBrandAnalyticsTimeSeries.mockClear();
    brandsServiceMock.findBrandCredentials.mockClear();
    brandsServiceMock.findBrandPosts.mockClear();
    brandsServiceMock.findOne.mockClear();
  });

  it('opens the shared post detail overlay from the recent posts table', async () => {
    render(<AnalyticsBrandOverview brandId="brand-1" />);

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
});
