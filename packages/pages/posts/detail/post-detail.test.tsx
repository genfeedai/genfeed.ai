import { PageScope, PostStatus } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import PostDetail from '@pages/posts/detail/post-detail';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const mockUsePostDetail = vi.fn();

vi.mock('@hooks/pages/use-post-detail/use-post-detail', () => ({
  usePostDetail: (...args: unknown[]) => mockUsePostDetail(...args),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => path }),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  usePostRemixModal: () => ({ openPostRemixModal: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@pages/posts/detail/components/PostDetailHeader', () => ({
  default: () => <div data-testid="post-header" />,
}));

vi.mock('@pages/posts/detail/components/PostDetailContent', () => ({
  default: () => <div data-testid="post-content" />,
}));

vi.mock('@ui/posts/post-detail-sidebar/PostDetailSidebar', () => ({
  default: () => <div data-testid="post-sidebar" />,
}));

vi.mock('@ui/posts/engagement-preview/EngagementPreview', () => ({
  default: () => <div data-testid="engagement-preview" />,
}));

function buildPost(overrides: Partial<IPost> = {}): IPost {
  return {
    description: 'copy',
    id: 'post-1',
    isDeleted: false,
    label: 'My post',
    status: PostStatus.DRAFT,
    ...overrides,
  } as unknown as IPost;
}

function buildHookData(overrides: Record<string, unknown> = {}) {
  return {
    analyticsStats: [],
    autoSaveRefs: {
      currentDescriptions: { current: new Map<string, string>() },
      currentLabels: { current: new Map<string, string>() },
      lastSavedDescriptions: { current: new Map<string, string>() },
      lastSavedLabels: { current: new Map<string, string>() },
      timeouts: { current: new Map<string, NodeJS.Timeout>() },
    },
    canAddFirstComment: false,
    canAddThread: false,
    carouselValidation: { errors: [], valid: true },
    childDescriptions: new Map<string, string>(),
    credential: null,
    descriptionDraft: 'copy',
    dragOverDividerIndex: null,
    draggedPostId: null,
    enhancingAction: null,
    enhancingPostId: null,
    error: null,
    firstCommentPost: null,
    focusedPostId: null,
    getPostsService: vi.fn(),
    handleAddToThread: vi.fn(),
    handleContentSave: vi.fn(),
    handleDeleteChild: vi.fn(),
    handleDeletePost: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragStart: vi.fn(),
    handleDrop: vi.fn(),
    handleExpandToThread: vi.fn(),
    handleGenerateIllustration: vi.fn(),
    handlePerTweetEnhance: vi.fn(),
    handleQuickAction: vi.fn(),
    handleScheduleSave: vi.fn(),
    handlePublishNow: vi.fn(),
    handlePublishViaTikTokApp: vi.fn(),
    handleSelectMedia: vi.fn(),
    handleToggleFirstComment: vi.fn(),
    handleToggleGrokFeedback: vi.fn(),
    handleUpdateChild: vi.fn(),
    hasChildren: false,
    hasFirstComment: false,
    isContentDirty: false,
    isExpandingToThread: false,
    isLastChildGrokTweet: false,
    isLoading: false,
    isPublished: false,
    isSavingDescription: false,
    isSavingIngredients: false,
    isSavingSchedule: false,
    isScheduleDirty: false,
    isTogglingFirstComment: false,
    isTogglingGrok: false,
    labelDraft: 'My post',
    notificationsService: { error: vi.fn(), success: vi.fn() },
    performAutoSaveForPost: vi.fn(),
    post: buildPost(),
    publishedDisplay: '',
    refreshPost: vi.fn(),
    scheduleDraft: null,
    selectedIngredients: [],
    setChildDescription: vi.fn(),
    setDescriptionDraft: vi.fn(),
    setDragOverDividerIndex: vi.fn(),
    setFocusedPostId: vi.fn(),
    setLabelDraft: vi.fn(),
    setScheduleDraft: vi.fn(),
    setViewMode: vi.fn(),
    sortedChildren: [],
    viewMode: 'edit',
    ...overrides,
  };
}

describe('PostDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePostDetail.mockReturnValue(buildHookData());
  });

  it('renders the header, content and sidebar for a loaded post', () => {
    render(<PostDetail postId="post-1" scope={PageScope.PUBLISHING} />);

    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-content')).toBeInTheDocument();
    expect(screen.getByTestId('post-sidebar')).toBeInTheDocument();
  });

  it('renders the page shell while the post is still loading', () => {
    mockUsePostDetail.mockReturnValue(
      buildHookData({ isLoading: true, post: null }),
    );

    render(<PostDetail postId="post-1" scope={PageScope.PUBLISHING} />);

    expect(screen.getByText('Post detail')).toBeInTheDocument();
    expect(screen.getByText('Loading post…')).toBeInTheDocument();
    expect(screen.getByTestId('post-detail-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('post-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-content')).not.toBeInTheDocument();
  });

  it('renders the error message when the hook reports an error', () => {
    mockUsePostDetail.mockReturnValue(
      buildHookData({ error: 'Boom', post: null }),
    );

    render(<PostDetail postId="post-1" scope={PageScope.PUBLISHING} />);

    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('renders a not-found message when the post is missing', () => {
    mockUsePostDetail.mockReturnValue(buildHookData({ post: null }));

    render(<PostDetail postId="post-1" scope={PageScope.PUBLISHING} />);

    expect(screen.getByText('Post not found')).toBeInTheDocument();
  });

  it('warns when the post failed to publish', () => {
    mockUsePostDetail.mockReturnValue(
      buildHookData({ post: buildPost({ status: PostStatus.FAILED }) }),
    );

    render(<PostDetail postId="post-1" scope={PageScope.PUBLISHING} />);

    expect(screen.getByText('Publication Failed')).toBeInTheDocument();
  });

  it('does not warn for a healthy post', () => {
    render(<PostDetail postId="post-1" scope={PageScope.PUBLISHING} />);

    expect(screen.queryByText('Publication Failed')).not.toBeInTheDocument();
  });

  it('applies the page container only for the page presentation', () => {
    const { container } = render(
      <PostDetail postId="post-1" scope={PageScope.PUBLISHING} />,
    );

    expect(container.querySelector('.container')).not.toBeNull();
  });

  it('drops the page container in the overlay presentation', () => {
    const { container } = render(
      <PostDetail
        postId="post-1"
        scope={PageScope.PUBLISHING}
        presentation="overlay"
      />,
    );

    expect(container.querySelector('.container')).toBeNull();
  });

  it('hands the sidebar to the host when a context renderer is provided', () => {
    const renderContextSidebar = vi.fn((sidebar: ReactNode, label: string) => (
      <div data-testid="context-host" data-label={label}>
        {sidebar}
      </div>
    ));

    render(
      <PostDetail
        postId="post-1"
        scope={PageScope.PUBLISHING}
        renderContextSidebar={renderContextSidebar}
      />,
    );

    expect(screen.getByTestId('context-host')).toHaveAttribute(
      'data-label',
      'My post',
    );
    expect(screen.getAllByTestId('post-sidebar')).toHaveLength(1);
  });

  it('falls back to an untitled context label when no label exists', () => {
    mockUsePostDetail.mockReturnValue(
      buildHookData({ labelDraft: '', post: buildPost({ label: '' }) }),
    );
    const renderContextSidebar = vi.fn((sidebar: ReactNode, label: string) => (
      <div data-testid="context-host" data-label={label}>
        {sidebar}
      </div>
    ));

    render(
      <PostDetail
        postId="post-1"
        scope={PageScope.PUBLISHING}
        renderContextSidebar={renderContextSidebar}
      />,
    );

    expect(screen.getByTestId('context-host')).toHaveAttribute(
      'data-label',
      'Untitled post',
    );
  });

  it('hides the engagement preview once the post is published', () => {
    mockUsePostDetail.mockReturnValue(buildHookData({ isPublished: true }));

    render(<PostDetail postId="post-1" scope={PageScope.PUBLISHING} />);

    expect(screen.queryByTestId('engagement-preview')).not.toBeInTheDocument();
  });
});
