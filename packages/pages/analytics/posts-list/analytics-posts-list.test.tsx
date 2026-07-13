import { AnalyticsProvider } from '@contexts/analytics/analytics-context';
import AnalyticsPostsList from '@pages/analytics/posts-list/analytics-posts-list';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const useTopPostsMock = vi.fn();

function renderPostsList() {
  return render(
    <AnalyticsProvider>
      <AnalyticsPostsList />
    </AnalyticsProvider>,
  );
}

vi.mock('@hooks/data/analytics/use-top-posts/use-top-posts', () => ({
  useTopPosts: (...args: unknown[]) => useTopPostsMock(...args),
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
  });

  it('renders the consolidated filter controls with shared field styling', () => {
    renderPostsList();

    const searchInput = screen.getByPlaceholderText('Search posts...');
    expect(searchInput).toHaveClass('rounded-lg');
    expect(searchInput).toHaveClass('border-white/[0.06]');

    const triggers = screen.getAllByRole('combobox');
    expect(triggers).toHaveLength(2);
    for (const trigger of triggers) {
      expect(trigger).toHaveClass('rounded-lg');
      expect(trigger).toHaveClass('border-white/[0.06]');
    }

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.queryByText('All Platforms')).not.toBeInTheDocument();
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
});
