import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import type { AnalyticsQueryFilters } from '@genfeedai/contracts/interfaces';
import AnalyticsPostsList from '@pages/analytics/posts-list/analytics-posts-list';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const useTopPostsMock = vi.fn();
const useWinnerPostsMock = vi.fn();

function ToolbarHost() {
  const { toolbarNode } = useAnalyticsContext();
  return <>{toolbarNode}</>;
}

function renderPostsList(restoredFilters?: AnalyticsQueryFilters) {
  return render(
    <AnalyticsProvider restoredFilters={restoredFilters}>
      <ToolbarHost />
      <AnalyticsPostsList />
    </AnalyticsProvider>,
  );
}

vi.mock('@hooks/data/analytics/use-top-posts/use-top-posts', () => ({
  useTopPosts: (...args: unknown[]) => useTopPostsMock(...args),
}));

vi.mock('@hooks/data/analytics/use-winner-posts/use-winner-posts', () => ({
  useWinnerPosts: (...args: unknown[]) => useWinnerPostsMock(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: pushMock,
    replace: replaceMock,
  })),
  usePathname: vi.fn(() => '/acme/moonrise/analytics/posts'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@pages/posts/detail/PostDetailOverlay', () => ({
  __esModule: true,
  default: ({ postId }: { postId: string | null }) => (
    <div data-testid="post-detail-overlay">{postId ?? 'closed'}</div>
  ),
}));

describe('AnalyticsPostsList', () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    useTopPostsMock.mockReset();
    useTopPostsMock.mockReturnValue({
      isLoading: false,
      topPosts: [],
    });
    useWinnerPostsMock.mockReset();
    useWinnerPostsMock.mockReturnValue({
      error: null,
      isLoading: false,
      refetch: vi.fn(),
      winners: [],
    });
  });

  it('renders the consolidated filter controls with shared field styling', () => {
    renderPostsList();

    const searchInput = screen.getByPlaceholderText('Search posts...');
    expect(searchInput).toHaveAttribute('name', 'search');
    expect(searchInput).toHaveClass('border-border');

    const triggers = screen.getAllByRole('combobox');
    expect(triggers).toHaveLength(3);
    for (const trigger of triggers) {
      expect(trigger).toHaveClass('rounded-lg');
      expect(trigger).toHaveClass('border-border');
    }

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.queryByText('All Platforms')).not.toBeInTheDocument();
  });

  it('keeps winners off until the Winners view is chosen', () => {
    renderPostsList();

    expect(useWinnerPostsMock).toHaveBeenCalledWith(
      expect.objectContaining({ isEnabled: false }),
    );
    expect(screen.getByText('All posts')).toBeInTheDocument();
  });

  it('shows each winner with the evidence that qualified it', () => {
    useWinnerPostsMock.mockReturnValue({
      error: null,
      isLoading: false,
      refetch: vi.fn(),
      winners: [
        {
          brandId: 'brand-1',
          brandName: 'Acme',
          contentType: 'video',
          description: null,
          engagementRate: 2,
          evidence: [
            {
              baseline: 10,
              ratio: 6,
              sampleSize: 8,
              signal: 'comments',
              tier: 'outlier',
              value: 60,
            },
          ],
          label: 'Launch reel',
          platform: 'instagram',
          postId: 'post-9',
          publishedAt: '2026-10-01T00:00:00.000Z',
          totalComments: 60,
          totalLikes: 100,
          totalViews: 1000,
        },
      ],
    });

    renderPostsList({ show: 'winners' });

    expect(useWinnerPostsMock).toHaveBeenCalledWith(
      expect.objectContaining({ isEnabled: true }),
    );
    expect(screen.getByText('Winners')).toBeInTheDocument();
    expect(screen.getByText('Outlier')).toBeInTheDocument();
    expect(
      screen.getByText('Comments 6.0× baseline (60 vs 10, 8 posts)'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Sort post analytics by metric' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Launch reel'));

    expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
      'post-9',
    );
  });

  it('explains why there are no winners instead of labelling thin data', () => {
    renderPostsList({ show: 'winners' });

    expect(
      screen.getByText(/A post wins when a metric beats its account/),
    ).toBeInTheDocument();
  });

  it('opens the shared post detail overlay from the analytics table row', () => {
    useTopPostsMock.mockReturnValue({
      isLoading: false,
      topPosts: [
        {
          brandName: 'Acme',
          engagementRate: 4.2,
          platform: 'twitter',
          postId: 'post-3',
          totalEngagement: 250,
          totalViews: 1200,
        },
      ],
    });

    renderPostsList();

    fireEvent.click(screen.getByText('Untitled Post'));

    expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
      'post-3',
    );
  });
  it('annotates views, interactions and percent engagement without opening content or changing filters', () => {
    useTopPostsMock.mockReturnValue({
      isLoading: false,
      topPosts: [
        {
          brandName: 'Acme',
          engagementRate: 0,
          platform: 'twitter',
          postId: 'post-3',
          totalEngagement: 0,
          totalViews: 0,
        },
      ],
    });
    renderPostsList();
    for (const name of [
      'About Views',
      'About Engagement',
      'About Engagement rate',
    ]) {
      fireEvent.click(screen.getByRole('button', { name }));
    }
    expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
      'closed',
    );
    expect(pushMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole('columnheader', { name: /Eng. Rate/ }),
    ).toContainElement(
      screen.getByRole('button', { name: 'About Engagement rate' }),
    );
  });
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
