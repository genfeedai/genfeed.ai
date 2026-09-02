import '@testing-library/jest-dom/vitest';
import { PageScope, Platform, PostStatus } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import PostsList from '@pages/posts/list/posts-list';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();
const pushMock = vi.fn();
const setFiltersNodeMock = vi.fn();
const setRefreshMock = vi.fn();
const setViewToggleNodeMock = vi.fn();
const resourceRefreshMock = vi.fn();
const lowCreditsBannerSpy = vi.fn();

const postFixture = {
  description: 'Contextual review target',
  id: 'post-1',
  platform: Platform.TWITTER,
  status: PostStatus.DRAFT,
} as IPost;

let resourceData: IPost[] = [];

type MockQueryResult = {
  data: unknown;
  isLoading: boolean;
  refetch: () => void;
};

let cachedQueryPosts: IPost[] | null = null;
let cachedPostsQueryResult: MockQueryResult | null = null;

const emptyListQueryResult: MockQueryResult = {
  data: [],
  isLoading: false,
  refetch: resourceRefreshMock,
};

// Every hook in the tree shares this mock, so discriminate on the query key.
// Handing the posts payload to AdminOrgBrandFilter's organizations query made
// it call `.map` on an object.
function queryResult(options: { queryKey?: readonly unknown[] }) {
  const key = String(options?.queryKey?.[0] ?? '');

  if (key !== 'posts-list') {
    return emptyListQueryResult;
  }

  if (cachedQueryPosts !== resourceData || cachedPostsQueryResult === null) {
    cachedQueryPosts = resourceData;
    cachedPostsQueryResult = {
      data: {
        pagination: {
          page: 1,
          pageSize: 12,
          total: resourceData.length,
          totalPages: 1,
        },
        posts: resourceData,
      },
      isLoading: false,
      refetch: resourceRefreshMock,
    };
  }

  return cachedPostsQueryResult;
}

type MockTableAction = {
  onClick: (post: IPost) => void;
  tooltip?: string;
};

type MockTableProps = {
  actions?: MockTableAction[];
  items: IPost[];
  onRowClick?: (post: IPost) => void;
};

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'paperclip', orgSlug: 'genfeed-ai' }),
  usePathname: () => '/genfeed-ai/paperclip/publishing',
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    credentials: [],
    isReady: true,
    organizationId: 'org-1',
  }),
}));

vi.mock('@contexts/posts/posts-layout-context', () => ({
  usePostsLayout: () => ({
    setExportNode: vi.fn(),
    setFiltersNode: setFiltersNodeMock,
    setIsRefreshing: vi.fn(),
    setRefresh: setRefreshMock,
    setScheduleActionsNode: vi.fn(),
    setViewToggleNode: setViewToggleNodeMock,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

// The query result must keep a stable identity across renders — a fresh object
// per render feeds identity-keyed effects in usePostsList and re-renders forever.
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey?: readonly unknown[] }) =>
    queryResult(options),
  useQueryClient: () => ({
    setQueryData: vi.fn(),
  }),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    isReady: false,
    subscribe: vi.fn(),
  }),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmDeleteModal: () => ({
    openConfirmDelete: vi.fn(),
  }),
  useIngredientOverlay: () => ({
    openIngredientOverlay: vi.fn(),
  }),
  usePostRemixModal: () => ({
    openPostRemixModal: vi.fn(),
  }),
  usePostRepurposeModal: () => ({
    openPostRepurposeModal: vi.fn(),
  }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

vi.mock('@ui/banners/low-credits/LowCreditsBanner', () => ({
  default: () => {
    lowCreditsBannerSpy();
    return <div data-testid="low-credits-banner" />;
  },
}));

vi.mock('@pages/posts/list/components/PostsGrid', () => ({
  __esModule: true,
  default: ({
    items,
    onOpenPostDetail,
    primaryAction,
    posts,
  }: {
    items?: IPost[];
    onOpenPostDetail?: (post: IPost) => void;
    primaryAction?: { onClick: (post: IPost) => void };
    posts?: IPost[];
  }) => {
    const gridPosts = posts ?? items ?? [];

    return (
      <>
        <button type="button" onClick={() => onOpenPostDetail?.(postFixture)}>
          Posts grid
        </button>
        <button
          type="button"
          onClick={() => {
            if (gridPosts[0] && primaryAction) {
              primaryAction.onClick(gridPosts[0]);
            }
          }}
        >
          Edit grid card
        </button>
      </>
    );
  },
}));

vi.mock('@pages/posts/detail/PostDetailOverlay', () => ({
  __esModule: true,
  default: ({ postId }: { postId: string | null }) => (
    <div data-testid="post-detail-overlay">{postId ?? 'closed'}</div>
  ),
}));

vi.mock('@pages/posts/list/components/PostsListToolbar', () => ({
  __esModule: true,
  default: () => <div>Posts toolbar</div>,
}));

vi.mock('@ui/display/table/Table', () => ({
  __esModule: true,
  default: ({ actions, items, onRowClick }: MockTableProps) => (
    <>
      <button
        type="button"
        onClick={() => {
          if (items[0]) {
            onRowClick?.(items[0]);
          }
        }}
      >
        Open table row
      </button>
      <button
        type="button"
        onClick={() => {
          const editAction = actions?.find(
            (action) => action.tooltip === 'Edit Post',
          );

          if (items[0] && editAction) {
            editAction.onClick(items[0]);
          }
        }}
      >
        Edit table row
      </button>
    </>
  ),
}));

describe('PostsList', () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    setFiltersNodeMock.mockReset();
    setRefreshMock.mockReset();
    setViewToggleNodeMock.mockReset();
    resourceRefreshMock.mockReset();
    resourceData = [];
  });

  it('registers one header toolbar without a docked product prompt bar', async () => {
    render(
      <PostsList
        scope={PageScope.PUBLISHING}
        platform="all"
        status={PostStatus.DRAFT}
      />,
    );

    // An explicit `status` prop opts out of the publisher `not-posted` default,
    // so the list header describes every lifecycle state.
    expect(screen.getByRole('heading', { name: 'All posts' })).toBeVisible();
    // Sidebar agent owns generation — no floating posts prompt bar.
    expect(
      screen.queryByPlaceholderText(/ai productivity tips/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /generate/i }),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(setFiltersNodeMock).toHaveBeenCalled();
    });
  });

  it.each([
    [PostStatus.PENDING, 'Pending'],
    [PostStatus.PROCESSING, 'Publishing'],
  ] as const)('labels the %s publisher view as %s', (status, heading) => {
    render(
      <PostsList scope={PageScope.PUBLISHING} platform="all" status={status} />,
    );

    expect(screen.getByRole('heading', { name: heading })).toBeVisible();
  });

  it('opens the post detail overlay from the table row path', async () => {
    resourceData = [postFixture];

    render(
      <PostsList
        scope={PageScope.ANALYTICS}
        platform="all"
        status={PostStatus.DRAFT}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /open table row/i }));

    expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
      'post-1',
    );
  });

  it('defaults the publisher list to the not-posted view when no status is given', () => {
    render(<PostsList scope={PageScope.PUBLISHING} platform="all" />);

    expect(screen.getByRole('heading', { name: 'Not posted' })).toBeVisible();
  });

  it('opens the dedicated post editor', () => {
    resourceData = [postFixture];

    render(
      <PostsList
        scope={PageScope.PUBLISHING}
        platform="all"
        status={PostStatus.DRAFT}
      />,
    );

    // The publisher list defaults to the card grid, so the edit affordance is
    // the card's primary action rather than a table row action.
    fireEvent.click(screen.getByRole('button', { name: /edit grid card/i }));

    expect(pushMock).toHaveBeenCalledWith(
      '/genfeed-ai/paperclip/publishing/posts/post-1',
    );
  });

  it('gives the superadmin table a read-only action set', () => {
    resourceData = [
      {
        ...postFixture,
        brand: { slug: 'owner-brand' },
        organization: { slug: 'owner-org' },
      } as IPost,
    ];

    render(
      <PostsList
        scope={PageScope.SUPERADMIN}
        platform="all"
        status={PostStatus.DRAFT}
      />,
    );

    // Superadmin browses platform-wide content; editing happens in the owning
    // brand's publisher scope, so no edit action is offered here.
    fireEvent.click(screen.getByRole('button', { name: /edit table row/i }));

    expect(pushMock).not.toHaveBeenCalled();
  });
});
