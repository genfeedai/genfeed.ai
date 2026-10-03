import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import AnalyticsPostsList from '@pages/analytics/posts-list/analytics-posts-list';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const useTopPostsMock = vi.fn();

function ToolbarHost() {
  const { toolbarNode } = useAnalyticsContext();
  return <>{toolbarNode}</>;
}

function renderPostsList() {
  return render(
    <AnalyticsProvider>
      <ToolbarHost />
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
    expect(searchInput).toHaveAttribute('name', 'search');
    expect(searchInput).toHaveClass('border-border');

    const triggers = screen.getAllByRole('combobox');
    expect(triggers).toHaveLength(2);
    for (const trigger of triggers) {
      expect(trigger).toHaveClass('rounded-lg');
      expect(trigger).toHaveClass('border-border');
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
