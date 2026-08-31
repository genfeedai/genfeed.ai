// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { PageScope, Platform, PostStatus } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import type { UsePostDetailReturn } from '@hooks/pages/use-post-detail/use-post-detail';
import PostDetail from '@pages/posts/detail/post-detail';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hookData: null as UsePostDetailReturn | null,
  openPostRemixModal: vi.fn(),
  openPostRepurposeModal: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('./next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/pages/use-post-detail/use-post-detail', () => ({
  usePostDetail: () => mocks.hookData,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/main${path}` }),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  usePostRemixModal: () => ({
    openPostRemixModal: mocks.openPostRemixModal,
  }),
  usePostRepurposeModal: () => ({
    openPostRepurposeModal: mocks.openPostRepurposeModal,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@pages/posts/detail/components/PostDetailContent', () => ({
  default: () => <article>Post body</article>,
}));

vi.mock('@pages/posts/detail/components/PostDetailHeader', () => ({
  default: () => <header>Post header</header>,
}));

vi.mock('@ui/posts/post-detail-sidebar/PostDetailSidebar', () => ({
  default: () => <section>Schedule and quality controls</section>,
}));

vi.mock('@ui/posts/engagement-preview/EngagementPreview', () => ({
  default: () => <section>Engagement preview</section>,
}));

vi.mock('@ui/display/skeleton/skeleton', () => ({
  SkeletonCard: () => <div>Loading post details</div>,
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

vi.mock('@ui/feedback/alert/Alert', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const post = {
  description: 'A scheduled launch update.',
  id: 'post-1',
  label: 'Launch post',
  platform: Platform.TWITTER,
  status: PostStatus.DRAFT,
} as IPost;

function createHookData(
  overrides: Partial<UsePostDetailReturn> = {},
): UsePostDetailReturn {
  const emptyMapRef = { current: new Map<string, string>() };
  const timeoutMapRef = { current: new Map<string, NodeJS.Timeout>() };

  return {
    analyticsStats: [],
    autoSaveRefs: {
      currentDescriptions: emptyMapRef,
      currentLabels: emptyMapRef,
      lastSavedDescriptions: emptyMapRef,
      lastSavedLabels: emptyMapRef,
      timeouts: timeoutMapRef,
    },
    canAddFirstComment: false,
    canAddThread: false,
    carouselValidation: { errors: [], valid: true },
    childDescriptions: new Map(),
    credential: undefined,
    descriptionDraft: post.description ?? '',
    draggedPostId: null,
    dragOverDividerIndex: null,
    enhancingAction: null,
    enhancingPostId: null,
    error: null,
    firstCommentPost: null,
    focusedPostId: post.id,
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
    isEditable: true,
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
    isUpdating: false,
    labelDraft: post.label ?? '',
    notificationsService: {
      error: vi.fn(),
      success: vi.fn(),
    } as UsePostDetailReturn['notificationsService'],
    pathname: '/acme/main/publishing/posts/post-1',
    performAutoSaveForPost: vi.fn(),
    post,
    publishedDisplay: '',
    refreshPost: vi.fn(),
    scheduleDraft: '',
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

describe('PostDetail Context handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hookData = createHookData();
  });

  it('hands loaded post context to the route host exactly once', () => {
    const renderContextSidebar = vi.fn(
      (sidebar: ReactNode, contextLabel: string) => (
        <aside aria-label={`Context for ${contextLabel}`}>{sidebar}</aside>
      ),
    );

    render(
      <PostDetail
        postId="post-1"
        presentation="page"
        renderContextSidebar={renderContextSidebar}
        scope={PageScope.PUBLISHING}
      />,
    );

    expect(
      screen.getByRole('complementary', { name: 'Context for Launch post' }),
    ).toBeVisible();
    expect(screen.getAllByText('Schedule and quality controls')).toHaveLength(
      1,
    );
    expect(renderContextSidebar).toHaveBeenCalledTimes(1);
    expect(renderContextSidebar.mock.calls[0]?.[1]).toBe('Launch post');
  });

  it('does not register Context content before the post has loaded', () => {
    mocks.hookData = createHookData({
      isLoading: true,
      labelDraft: '',
      post: null,
    });
    const renderContextSidebar = vi.fn();

    render(
      <PostDetail
        postId="post-1"
        renderContextSidebar={renderContextSidebar}
        scope={PageScope.PUBLISHING}
      />,
    );

    expect(screen.getAllByText('Loading post details')).toHaveLength(4);
    expect(renderContextSidebar).not.toHaveBeenCalled();
  });
});
