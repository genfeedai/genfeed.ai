import { CredentialPlatform, PageScope } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import PostDetailContent, {
  type PostDetailContentProps,
} from '@pages/posts/detail/components/PostDetailContent';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

const { listProps, barProps } = vi.hoisted(() => ({
  barProps: { current: null as Record<string, unknown> | null },
  listProps: { current: null as Record<string, unknown> | null },
}));

vi.mock('@pages/posts/detail/components/PostDetailPostList', () => ({
  default: (props: Record<string, unknown>) => {
    listProps.current = props;
    return <div data-testid="post-list" />;
  },
}));

vi.mock('@pages/posts/detail/components/PostDetailThreadFooter', () => ({
  default: () => <div data-testid="thread-footer" />,
}));

vi.mock('@ui/posts/composer-prompt-bar/PostComposerPromptBar', () => ({
  default: (props: Record<string, unknown>) => {
    barProps.current = props;
    return <div data-testid="prompt-bar">{String(props.targetLabel)}</div>;
  },
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

function applyRewrite(text: string): void {
  const apply = barProps.current?.onApplyRewrite as
    | ((value: string) => void)
    | undefined;
  if (!apply) {
    throw new Error('Prompt bar was not rendered');
  }
  apply(text);
}

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
    enhancingPostId: null,
    firstCommentPost: null,
    focusedPostId: null,
    getPostsService: vi.fn(),
    handleAddThreadPosts: vi.fn(),
    handleAddToThread: vi.fn(),
    handleContentSave: vi.fn(),
    handleDeleteChild: vi.fn(),
    handleDraftThread: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragStart: vi.fn(),
    handleDrop: vi.fn(),
    handleGenerateIllustration: vi.fn(),
    handlePerTweetEnhance: vi.fn(),
    handleQuickAction: vi.fn(),
    handleSelectMedia: vi.fn(),
    handleSetGrokQuestion: vi.fn(),
    handleToggleFirstComment: vi.fn(),
    handleToggleGrokFeedback: vi.fn(),
    handleUpdateChild: vi.fn(),
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

  it('renders the thread footer and prompt bar while composing', () => {
    render(<PostDetailContent {...buildProps()} />);

    expect(screen.getByTestId('thread-footer')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-bar')).toBeInTheDocument();
  });

  it('hides the thread footer and prompt bar outside the publisher scope', () => {
    render(<PostDetailContent {...buildProps({ scope: PageScope.BRAND })} />);

    expect(screen.queryByTestId('thread-footer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('prompt-bar')).not.toBeInTheDocument();
  });

  it('hides the prompt bar once the post is published', () => {
    render(
      <PostDetailContent
        {...buildProps({
          post: buildPost({ publicationDate: '2026-10-01T09:00:00.000Z' }),
        })}
      />,
    );

    expect(screen.queryByTestId('prompt-bar')).not.toBeInTheDocument();
  });

  it('keeps the first comment out of the post list', () => {
    const firstComment = buildPost({ id: 'comment-1' });
    render(
      <PostDetailContent
        {...buildProps({
          canAddFirstComment: true,
          firstCommentPost: firstComment,
          sortedChildren: [firstComment],
        })}
      />,
    );

    expect(listProps.current?.sortedChildren).toEqual([]);
    expect(barProps.current?.canAddFirstComment).toBe(false);
  });

  it('offers thread presets on an X post without replies', () => {
    render(
      <PostDetailContent
        {...buildProps({
          canAddThread: true,
          post: buildPost({
            id: 'post-1',
            platform: CredentialPlatform.TWITTER,
          }),
        })}
      />,
    );

    expect(barProps.current?.canDraftThread).toBe(true);
    expect(barProps.current?.canEndWithGrok).toBe(true);
    expect(screen.getByTestId('prompt-bar')).toHaveTextContent('Post 1');
  });

  it('applies an accepted rewrite to the post the user last worked in', () => {
    const setDescriptionDraft = vi.fn();
    const setChildDescription = vi.fn();
    const child = buildPost({ id: 'child-1' });
    const props = buildProps({
      post: buildPost({ id: 'post-1', platform: CredentialPlatform.TWITTER }),
      setChildDescription,
      setDescriptionDraft,
      sortedChildren: [child],
    });
    const { rerender } = render(<PostDetailContent {...props} />);

    act(() => {
      applyRewrite('Parent');
    });
    expect(setDescriptionDraft).toHaveBeenCalledWith('<p>Parent</p>');

    rerender(<PostDetailContent {...props} focusedPostId="child-1" />);
    rerender(<PostDetailContent {...props} focusedPostId={null} />);

    expect(screen.getByTestId('prompt-bar')).toHaveTextContent('Post 2');
    act(() => {
      applyRewrite('Reply');
    });
    expect(setChildDescription).toHaveBeenCalledWith('child-1', '<p>Reply</p>');
  });

  it('routes quick actions and free-form prompts to the target post', async () => {
    const handleQuickAction = vi.fn().mockResolvedValue('a');
    const handlePerTweetEnhance = vi.fn().mockResolvedValue('b');
    render(
      <PostDetailContent
        {...buildProps({ handlePerTweetEnhance, handleQuickAction })}
      />,
    );
    const onRewrite = barProps.current?.onRewrite as (
      prompt: string,
      actionKey: string | null,
      tone: string,
    ) => Promise<string | null>;

    await onRewrite('shorter', 'shorten', 'casual');
    await onRewrite('custom', null, 'viral');

    expect(handleQuickAction).toHaveBeenCalledWith(
      'post-1',
      'shorter',
      'shorten',
      'casual',
    );
    expect(handlePerTweetEnhance).toHaveBeenCalledWith(
      'post-1',
      'custom',
      'viral',
    );
  });
});
