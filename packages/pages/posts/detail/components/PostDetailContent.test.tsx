import { PageScope } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import PostDetailContent, {
  type PostDetailContentProps,
} from '@pages/posts/detail/components/PostDetailContent';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@pages/posts/detail/components/PostDetailPostList', () => ({
  default: () => <div data-testid="post-list" />,
}));

vi.mock('@pages/posts/detail/components/PostDetailThreadExtras', () => ({
  default: () => <div data-testid="thread-extras" />,
}));

vi.mock('@ui/posts/preview/thread-preview-panel/ThreadPreviewPanel', () => ({
  default: ({
    parent,
    replies,
  }: {
    parent: { content: string; id: string };
    replies: { content: string; id: string }[];
  }) => (
    <div data-testid="thread-preview">
      <span data-testid="preview-parent">{parent.content}</span>
      <span data-testid="preview-reply-count">{replies.length}</span>
    </div>
  ),
}));

function buildPost(overrides: Partial<IPost> = {}): IPost {
  return {
    description: 'child copy',
    id: 'post-1',
    isDeleted: false,
    ...overrides,
  } as unknown as IPost;
}

function buildProps(
  overrides: Partial<PostDetailContentProps> = {},
): PostDetailContentProps {
  return {
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
    descriptionDraft: 'parent copy',
    dragOverDividerIndex: null,
    draggedPostId: null,
    enhancingAction: null,
    enhancingPostId: null,
    firstCommentPost: null,
    focusedPostId: null,
    getPostsService: vi.fn(),
    handleAddToThread: vi.fn(),
    handleContentSave: vi.fn(),
    handleDeleteChild: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragStart: vi.fn(),
    handleDrop: vi.fn(),
    handleGenerateIllustration: vi.fn(),
    handlePerTweetEnhance: vi.fn(),
    handleQuickAction: vi.fn(),
    handleSelectMedia: vi.fn(),
    handleToggleFirstComment: vi.fn(),
    handleToggleGrokFeedback: vi.fn(),
    handleUpdateChild: vi.fn(),
    hasChildren: false,
    hasFirstComment: false,
    isContentDirty: false,
    isLastChildGrokTweet: false,
    isSavingDescription: false,
    isSavingIngredients: false,
    isTogglingFirstComment: false,
    isTogglingGrok: false,
    labelDraft: 'Label',
    notificationsService: {},
    performAutoSaveForPost: vi.fn(),
    post: buildPost({ description: 'parent copy', id: 'post-1' }),
    publishedDisplay: '',
    scope: PageScope.PUBLISHING,
    selectedIngredients: [],
    setChildDescription: vi.fn(),
    setDescriptionDraft: vi.fn(),
    setDragOverDividerIndex: vi.fn(),
    setFocusedPostId: vi.fn(),
    setLabelDraft: vi.fn(),
    sortedChildren: [],
    viewMode: 'edit',
    ...overrides,
  } as unknown as PostDetailContentProps;
}

describe('PostDetailContent', () => {
  it('renders the editable post list in edit mode', () => {
    render(<PostDetailContent {...buildProps()} />);

    expect(screen.getByTestId('post-list')).toBeInTheDocument();
    expect(screen.queryByTestId('thread-preview')).not.toBeInTheDocument();
  });

  it('renders the read-only thread preview in preview mode', () => {
    render(
      <PostDetailContent
        {...buildProps({
          sortedChildren: [
            buildPost({ id: 'child-1' }),
            buildPost({ id: 'child-2' }),
          ],
          viewMode: 'preview',
        })}
      />,
    );

    expect(screen.getByTestId('thread-preview')).toBeInTheDocument();
    expect(screen.getByTestId('preview-parent')).toHaveTextContent(
      'parent copy',
    );
    expect(screen.getByTestId('preview-reply-count')).toHaveTextContent('2');
    expect(screen.queryByTestId('post-list')).not.toBeInTheDocument();
  });

  it('hides the thread extras when nothing can be added', () => {
    render(<PostDetailContent {...buildProps()} />);

    expect(screen.queryByTestId('thread-extras')).not.toBeInTheDocument();
  });

  it('renders the thread extras when a thread can be added in publisher scope', () => {
    render(<PostDetailContent {...buildProps({ canAddThread: true })} />);

    expect(screen.getByTestId('thread-extras')).toBeInTheDocument();
  });

  it('renders the thread extras when a first comment can be added', () => {
    render(<PostDetailContent {...buildProps({ canAddFirstComment: true })} />);

    expect(screen.getByTestId('thread-extras')).toBeInTheDocument();
  });

  it('hides the thread extras outside the publisher scope', () => {
    render(
      <PostDetailContent
        {...buildProps({ canAddThread: true, scope: PageScope.BRAND })}
      />,
    );

    expect(screen.queryByTestId('thread-extras')).not.toBeInTheDocument();
  });
});
