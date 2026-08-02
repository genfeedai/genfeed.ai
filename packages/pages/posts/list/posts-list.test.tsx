import '@testing-library/jest-dom/vitest';
import { PageScope, Platform, PostStatus } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
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
  usePathname: () => '/genfeed-ai/paperclip/posts',
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

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
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
  }),
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
    onOpenPostDetail,
  }: {
    onOpenPostDetail?: (post: IPost) => void;
  }) => (
    <button type="button" onClick={() => onOpenPostDetail?.(postFixture)}>
      Posts grid
    </button>
  ),
  postCardIcons: {
    delete: <>delete</>,
    edit: <>edit</>,
    remix: <>remix</>,
    viewIngredient: <>ingredient</>,
    viewPlatform: <>platform</>,
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

  it('registers one header toolbar and renders the prompt bar without duplicate status chrome', async () => {
    render(
      <PostsList
        scope={PageScope.PUBLISHER}
        platform="all"
        status={PostStatus.DRAFT}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Not posted' })).toBeVisible();
    expect(
      screen.getByPlaceholderText(/ai productivity tips/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('low-credits-banner')).toBeInTheDocument();
    expect(screen.queryByText('Generated')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(setFiltersNodeMock).toHaveBeenCalled();
    });
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

  it('opens the dedicated post editor and carries the list back with it', () => {
    resourceData = [postFixture];

    render(
      <PostsList
        scope={PageScope.PUBLISHER}
        platform="all"
        status={PostStatus.DRAFT}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /edit table row/i }));

    expect(pushMock).toHaveBeenCalledWith(
      '/genfeed-ai/paperclip/edit/post/post-1?returnTo=%2Fgenfeed-ai%2Fpaperclip%2Fposts',
    );
  });

  it('opens superadmin edits in the post owner scope', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /edit table row/i }));

    expect(pushMock).toHaveBeenCalledWith(
      '/owner-org/owner-brand/edit/post/post-1?returnTo=%2Fgenfeed-ai%2Fpaperclip%2Fposts',
    );
  });
});
