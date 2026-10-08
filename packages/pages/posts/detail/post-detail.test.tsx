import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
  useContextSidebar,
} from '@contexts/ui/context-sidebar-context';
import { PageScope, Platform, PostStatus } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import type { TargetPreviewProps } from '@genfeedai/props/ui/previews.props';
import PostDetail from '@pages/posts/detail/post-detail';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  usePostRepurposeModal: () => ({ openPostRepurposeModal: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@pages/posts/detail/components/PostDetailHeader', () => ({
  default: ({ headingLevel }: { headingLevel?: 1 | 2 }) => (
    <div data-testid="post-header" data-heading-level={headingLevel} />
  ),
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

vi.mock('@ui/previews/TargetPreview', () => ({
  default: ({ release }: TargetPreviewProps) => (
    <div data-testid="target-preview" data-content={release.baseContent} />
  ),
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

function SidebarProbe() {
  const sidebar = useContextSidebar();
  return (
    <div>
      <output data-testid="sidebar-selection">
        {sidebar?.selection?.id ?? 'none'}
      </output>
      <output data-testid="sidebar-open">{String(sidebar?.isOpen)}</output>
      <button type="button" onClick={sidebar?.close}>
        Close inspector
      </button>
      <button type="button" onClick={sidebar?.reveal}>
        Reveal inspector
      </button>
    </div>
  );
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

    expect(
      screen.getByText('This post failed to publish.'),
    ).toBeInTheDocument();
  });

  it('does not warn for a healthy post', () => {
    render(<PostDetail postId="post-1" scope={PageScope.PUBLISHING} />);

    expect(
      screen.queryByText('This post failed to publish.'),
    ).not.toBeInTheDocument();
  });

  it('applies the page container only for the page presentation', () => {
    const { container } = render(
      <PostDetail postId="post-1" scope={PageScope.PUBLISHING} />,
    );

    expect(container.querySelector('.container')).not.toBeNull();
    expect(screen.getByTestId('post-header')).toHaveAttribute(
      'data-heading-level',
      '1',
    );
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
    expect(screen.getByTestId('post-header')).toHaveAttribute(
      'data-heading-level',
      '2',
    );
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

  it('does not render a live preview when the post has no resolved platform', () => {
    render(<PostDetail postId="post-1" scope={PageScope.PUBLISHING} />);

    expect(screen.queryByTestId('target-preview')).not.toBeInTheDocument();
  });

  it('renders a live preview once the post has a resolved platform', () => {
    mockUsePostDetail.mockReturnValue(
      buildHookData({
        post: buildPost({ platform: Platform.TWITTER }),
      }),
    );

    render(<PostDetail postId="post-1" scope={PageScope.PUBLISHING} />);

    expect(screen.getByTestId('target-preview')).toBeInTheDocument();
  });
});

describe('PostDetail standalone composer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePostDetail.mockReturnValue(
      buildHookData({
        post: buildPost({ platform: Platform.TWITTER }),
      }),
    );
  });

  it('portals metadata into the shell inspector and keeps the preview in the composer', () => {
    render(
      <ContextSidebarProvider>
        <PostDetail postId="post-1" scope={PageScope.PUBLISHING} />
        <ContextSidebarOutlet testId="inspector-outlet" />
        <SidebarProbe />
      </ContextSidebarProvider>,
    );

    const inspector = screen.getByTestId('inspector-outlet');
    expect(within(inspector).getByTestId('post-sidebar')).toBeInTheDocument();
    expect(
      within(inspector).queryByTestId('target-preview'),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Post composer' })).getByTestId(
        'target-preview',
      ),
    ).not.toBeVisible();
    expect(screen.getByTestId('sidebar-selection')).toHaveTextContent('post-1');
    expect(screen.getByTestId('sidebar-open')).toHaveTextContent('true');
  });

  it('closes and reveals the same inspector without losing the post selection', async () => {
    const user = userEvent.setup();
    render(
      <ContextSidebarProvider>
        <PostDetail postId="post-1" scope={PageScope.PUBLISHING} />
        <ContextSidebarOutlet testId="inspector-outlet" />
        <SidebarProbe />
      </ContextSidebarProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Close inspector' }));
    expect(screen.getByTestId('sidebar-open')).toHaveTextContent('false');
    expect(screen.getByTestId('sidebar-selection')).toHaveTextContent('post-1');
    await user.click(screen.getByRole('button', { name: 'Reveal inspector' }));
    expect(screen.getByTestId('sidebar-open')).toHaveTextContent('true');
  });

  it('unregisters the inspector when the post route unmounts', () => {
    const { rerender } = render(
      <ContextSidebarProvider>
        <PostDetail postId="post-1" scope={PageScope.PUBLISHING} />
        <ContextSidebarOutlet testId="inspector-outlet" />
        <SidebarProbe />
      </ContextSidebarProvider>,
    );
    rerender(
      <ContextSidebarProvider>
        <ContextSidebarOutlet testId="inspector-outlet" />
        <SidebarProbe />
      </ContextSidebarProvider>,
    );
    expect(screen.getByTestId('sidebar-selection')).toHaveTextContent('none');
    expect(
      within(screen.getByTestId('inspector-outlet')).queryByTestId(
        'post-sidebar',
      ),
    ).not.toBeInTheDocument();
  });

  it('toggles a published preview without remounting the content or enabling edits', async () => {
    const user = userEvent.setup();
    const hookData = buildHookData({
      isPublished: true,
      post: buildPost({
        platform: Platform.TWITTER,
        status: PostStatus.PUBLIC,
      }),
      viewMode: 'preview',
    });
    mockUsePostDetail.mockReturnValue(hookData);
    render(<PostDetail postId="post-1" scope={PageScope.PUBLISHING} />);
    const content = screen.getByTestId('post-content');
    const button = screen.getByRole('button', { name: 'Preview', exact: true });
    expect(content).toBeVisible();
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveFocus();
    expect(content).not.toBeVisible();
    expect(screen.getByTestId('target-preview')).toBeVisible();
    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveFocus();
    expect(screen.getByTestId('post-content')).toBe(content);
    expect(content).toBeVisible();
    expect(hookData.setViewMode).not.toHaveBeenCalled();
    expect(hookData.handleContentSave).not.toHaveBeenCalled();
    expect(hookData.performAutoSaveForPost).not.toHaveBeenCalled();
  });

  it('previews the current parent and child drafts, including intentionally cleared text', async () => {
    const user = userEvent.setup();
    mockUsePostDetail.mockReturnValue(
      buildHookData({
        childDescriptions: new Map([['reply-1', 'Updated reply']]),
        descriptionDraft: '',
        post: buildPost({
          description: 'Old body',
          platform: Platform.TWITTER,
        }),
        sortedChildren: [
          buildPost({ description: 'Old reply', id: 'reply-1' }),
        ],
      }),
    );
    render(<PostDetail postId="post-1" scope={PageScope.PUBLISHING} />);
    await user.click(
      screen.getByRole('button', { name: 'Preview', exact: true }),
    );
    const previews = within(
      screen.getByRole('region', { name: 'Post composer' }),
    ).getAllByTestId('target-preview');
    expect(previews).toHaveLength(2);
    expect(previews[0]).toHaveAttribute('data-content', '');
    expect(previews[1]).toHaveAttribute('data-content', 'Updated reply');
  });

  it('keeps unresolved platform state inside the composer preview', async () => {
    const user = userEvent.setup();
    mockUsePostDetail.mockReturnValue(buildHookData());
    render(<PostDetail postId="post-1" scope={PageScope.PUBLISHING} />);
    await user.click(
      screen.getByRole('button', { name: 'Preview', exact: true }),
    );
    expect(
      within(screen.getByRole('region', { name: 'Post composer' })).getByText(
        'Choose a platform to preview this post.',
      ),
    ).toBeVisible();
  });

  it('preserves the overlay sidebar and existing view-mode controls', () => {
    render(
      <PostDetail
        postId="post-1"
        scope={PageScope.PUBLISHING}
        presentation="overlay"
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Preview', exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('target-preview')).toBeVisible();
    expect(screen.getByTestId('post-sidebar')).toBeVisible();
  });

  it('preserves custom sidebar hosts in embedded pages', () => {
    render(
      <PostDetail
        postId="post-1"
        scope={PageScope.PUBLISHING}
        renderContextSidebar={(sidebar) => (
          <aside aria-label="Embedded details">{sidebar}</aside>
        )}
      />,
    );
    expect(
      within(
        screen.getByRole('complementary', { name: 'Embedded details' }),
      ).getByTestId('target-preview'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Preview', exact: true }),
    ).not.toBeInTheDocument();
  });
});
