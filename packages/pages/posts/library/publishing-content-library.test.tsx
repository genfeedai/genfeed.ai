import '@testing-library/jest-dom/vitest';
import {
  ArticleCategory,
  Platform,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import PublishingContentLibrary from '@pages/posts/library/publishing-content-library';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryData: null as unknown,
  updateTarget: vi.fn(),
  retry: vi.fn(),
  refetch: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  search: '',
  setFiltersNode: vi.fn(),
  setIsRefreshing: vi.fn(),
  setRefresh: vi.fn(),
  setViewToggleNode: vi.fn(),
}));

const collections = {
  articles: [
    {
      category: ArticleCategory.TUTORIAL,
      createdAt: '2026-08-07T10:00:00.000Z',
      id: 'article-1',
      label: 'Launch guide',
      status: 'PUBLISHED',
      summary: 'Long-form launch plan',
    },
  ],
  newsletters: [
    {
      createdAt: '2026-08-06T10:00:00.000Z',
      id: 'newsletter-1',
      label: 'Founder weekly',
      status: 'ready_for_review',
      summary: 'This week in operations',
      topic: 'Operations',
    },
  ],
  posts: [
    {
      createdAt: '2026-08-08T10:00:00.000Z',
      description: 'Social launch copy',
      id: 'post-1',
      platform: Platform.INSTAGRAM,
      status: PostStatus.SCHEDULED,
    },
  ],
};

vi.mock('@pages/posts/release/release-detail-drawer', () => ({
  default: () => null,
}));

vi.mock('@pages/posts/detail/PostDetailOverlay', () => ({
  default: () => null,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
}));

vi.mock('@contexts/posts/posts-layout-context', () => ({
  usePostsLayout: () => ({
    setFiltersNode: mocks.setFiltersNode,
    setIsRefreshing: mocks.setIsRefreshing,
    setRefresh: mocks.setRefresh,
    setViewToggleNode: mocks.setViewToggleNode,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    updateTarget: mocks.updateTarget,
    retry: mocks.retry,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/main${path}` }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mocks.queryData,
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: mocks.refetch,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/main/publishing/posts',
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
  }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

describe('PublishingContentLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryData = collections;
    mocks.search = '';
  });

  it('renders the federated rows and registers the filter toolbar', async () => {
    render(<PublishingContentLibrary />);

    expect(
      screen.getByRole('link', { name: 'Open Social launch copy' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open Launch guide' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open Founder weekly' }),
    ).toBeVisible();
    expect(screen.getByText('3 posts')).toBeVisible();

    await waitFor(() => expect(mocks.setFiltersNode).toHaveBeenCalled());
  });

  it.each([
    ['Social launch copy', '/publishing/posts/post-1'],
    ['Launch guide', '/publishing/posts/article-1'],
    ['Founder weekly', '/publishing/posts/newsletter-1'],
  ])('opens %s through its canonical editor route', (title, route) => {
    render(<PublishingContentLibrary />);

    expect(screen.getByRole('link', { name: `Open ${title}` })).toHaveAttribute(
      'href',
      `/acme/main${route}`,
    );
  });

  it('opens a release title through the release query param, not the post editor route', () => {
    mocks.queryData = {
      ...collections,
      releases: [
        {
          baseContent: 'Cross-posted launch update',
          createdAt: '2026-08-09T10:00:00.000Z',
          id: 'release-1',
          status: 'scheduled',
          targets: [{ id: 'release-post-1', platform: Platform.INSTAGRAM }],
          title: 'Launch update release',
        } as unknown as IReleaseGroup,
      ],
    };

    render(<PublishingContentLibrary />);

    expect(
      screen.getByRole('link', { name: 'Open Launch update release' }),
    ).toHaveAttribute('href', '/acme/main/publishing/posts?release=release-1');
  });

  it('links to the approval queue and carries the selected batch and item', async () => {
    mocks.search = 'batch=batch-1&item=item-9&status=draft';

    render(<PublishingContentLibrary />);

    await waitFor(() => expect(mocks.setFiltersNode).toHaveBeenCalled());
    const [toolbar] = mocks.setFiltersNode.mock.calls.at(-1) ?? [];
    render(toolbar);

    expect(screen.getByRole('link', { name: 'approvalQueue' })).toHaveAttribute(
      'href',
      '/acme/main/publishing/review?batch=batch-1&item=item-9',
    );
  });

  it('combines multiple statuses with the content type', () => {
    mocks.search = 'status=published&status=draft&type=article';
    render(<PublishingContentLibrary />);
    expect(
      screen.getByRole('link', { name: 'Open Launch guide' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Open Founder weekly' }),
    ).not.toBeInTheDocument();
  });

  it('surfaces failed and imminent posts but excludes later posts from Needs you', () => {
    mocks.queryData = {
      articles: [],
      newsletters: [],
      posts: [
        {
          ...collections.posts[0],
          id: 'failed',
          description: 'Failed post',
          status: PostStatus.FAILED,
        },
        {
          ...collections.posts[0],
          id: 'soon',
          description: 'Soon post',
          scheduledDate: new Date(Date.now() + 3600000).toISOString(),
        },
        {
          ...collections.posts[0],
          id: 'later',
          description: 'Later post',
          scheduledDate: new Date(Date.now() + 172800000).toISOString(),
        },
      ],
    };
    render(<PublishingContentLibrary />);
    const attention = within(screen.getByRole('region', { name: 'needsYou' }));
    expect(
      attention.getByRole('link', { name: 'Open Failed post' }),
    ).toBeVisible();
    expect(attention.getByRole('button', { name: 'retry' })).toBeVisible();
    expect(
      attention.getByRole('link', { name: 'Open Soon post' }),
    ).toBeVisible();
    expect(
      attention.queryByRole('link', { name: 'Open Later post' }),
    ).not.toBeInTheDocument();
  });

  it('retries eligible failed targets and skips readiness-blocked channels', async () => {
    mocks.queryData = {
      articles: [],
      newsletters: [],
      posts: [],
      releases: [
        {
          id: 'release-retry',
          title: 'Retry release',
          createdAt: '2026-09-28T12:00:00Z',
          status: 'failed',
          targets: [
            {
              id: 'blocked',
              platform: Platform.INSTAGRAM,
              executionState: TargetExecutionState.FAILED,
              readiness: { canSchedule: false },
            },
            {
              id: 'eligible',
              platform: Platform.TWITTER,
              executionState: TargetExecutionState.FAILED,
            },
          ],
        },
      ],
    };
    render(<PublishingContentLibrary />);
    const section = within(screen.getByRole('region', { name: 'needsYou' }));
    fireEvent.click(section.getByRole('button', { name: 'retry' }));
    await waitFor(() =>
      expect(mocks.updateTarget).toHaveBeenCalledWith(
        'release-retry',
        'eligible',
        { executionState: TargetExecutionState.SCHEDULED },
      ),
    );
    expect(mocks.updateTarget).not.toHaveBeenCalledWith(
      'release-retry',
      'blocked',
      expect.anything(),
    );
  });

  it('uses a target schedule even when the release has no group schedule', () => {
    mocks.queryData = {
      articles: [],
      newsletters: [],
      posts: [],
      releases: [
        {
          id: 'release-soon',
          title: 'Target schedule',
          createdAt: '2026-09-28T12:00:00Z',
          status: 'draft',
          scheduledAt: null,
          targets: [
            {
              id: 'target-soon',
              platform: Platform.INSTAGRAM,
              executionState: TargetExecutionState.SCHEDULED,
              scheduledDate: new Date(Date.now() + 3600000).toISOString(),
            },
          ],
        },
      ],
    };
    render(<PublishingContentLibrary />);
    expect(
      within(screen.getByRole('region', { name: 'needsYou' })).getByRole(
        'link',
        { name: 'Open Target schedule' },
      ),
    ).toBeVisible();
  });

  it('keeps board status columns and card actions available', () => {
    mocks.search = 'view=board';
    render(<PublishingContentLibrary />);
    expect(screen.getByRole('region', { name: 'Scheduled' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open Social launch copy' }),
    ).toBeVisible();
  });

  it('retains the view selector around calendar content', () => {
    mocks.search = 'view=calendar';
    render(<PublishingContentLibrary calendar={<div>Calendar content</div>} />);
    expect(screen.getByText('Calendar content')).toBeVisible();
    expect(mocks.setViewToggleNode).toHaveBeenCalled();
  });

  it('shows the combination empty state when URL filters match no rows', () => {
    mocks.search = 'type=newsletter&platform=email&status=published';

    render(<PublishingContentLibrary />);

    expect(screen.getByText('0 posts')).toBeVisible();
    expect(screen.getByText('No matching posts')).toBeVisible();
    expect(
      screen.getByText(
        'Try a different type, channel, lifecycle status, or search.',
      ),
    ).toBeVisible();
  });

  it('shows a distinct empty state when the library has no content', () => {
    mocks.queryData = {
      articles: [],
      newsletters: [],
      posts: [],
    };

    render(<PublishingContentLibrary />);

    expect(screen.getByText('No posts yet')).toBeVisible();
    expect(
      screen.getByText(
        'Posts, articles, and newsletters will appear here as you create them.',
      ),
    ).toBeVisible();
  });
});
