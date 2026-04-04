import '@testing-library/jest-dom';
import type { Post } from '@models/content/post.model';
import AnalyticsPlatformDetail from '@pages/analytics/platform-detail/analytics-platform-detail';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();

const platformPost = {
  id: 'post-1',
  ingredients: [{ metadataLabel: 'Platform detail post' }],
  platform: 'twitter',
  publishedAt: '2026-03-10T10:00:00.000Z',
  totalComments: 12,
  totalLikes: 42,
  totalShares: 3,
  totalViews: 900,
} as Post;

const brandsServiceMock = {
  findBrandPosts: vi.fn(async () => [platformPost]),
  findOne: vi.fn(async () => ({ label: 'Acme' })),
};

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt || ''} />
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({
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
      Open analytics platform row
    </button>
  ),
}));

describe('AnalyticsPlatformDetail', () => {
  beforeEach(() => {
    pushMock.mockReset();
    brandsServiceMock.findBrandPosts.mockClear();
    brandsServiceMock.findOne.mockClear();
  });

  it('opens the shared post detail overlay from the analytics table row', async () => {
    render(<AnalyticsPlatformDetail brandId="brand-1" platform="twitter" />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /open analytics platform row/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /open analytics platform row/i }),
    );

    expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
      'post-1',
    );
  });
});
