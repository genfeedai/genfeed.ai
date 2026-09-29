import { PageScope, Platform } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import PostDetailCard from '@pages/posts/detail/components/PostDetailCard';
import type { PostDetailCardProps } from '@props/components/post-detail-card.props';
import { fireEvent, render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockOpenDeleteConfirm = vi.fn();
const mockHandleSaveDescription = vi.fn();

let hookResult = {
  handleSaveDescription: mockHandleSaveDescription,
  hasAnalytics: false,
  isEditable: true,
  isGrokTweet: false,
  isParent: true,
  isSavingLocal: false,
  isTwitter: true,
  localIngredients: [],
  openDeleteConfirm: mockOpenDeleteConfirm,
  placeholder: 'Write something',
};

vi.mock('@pages/posts/detail/components/usePostDetailCard', () => ({
  usePostDetailCard: () => hookResult,
}));

vi.mock('@pages/posts/detail/components/PostDetailCardBody', () => ({
  default: () => <div data-testid="card-body" />,
}));

vi.mock(
  '@ui/posts/enhancement-bar/post-enhancement-bar/PostEnhancementBar',
  () => ({
    default: () => <div data-testid="enhancement-bar" />,
  }),
);

function buildProps(
  overrides: Partial<PostDetailCardProps> = {},
): PostDetailCardProps {
  return {
    autoSaveTimeoutsRef: { current: new Map<string, NodeJS.Timeout>() },
    carouselValidation: { errors: [], valid: true },
    currentDescriptionsRef: { current: new Map<string, string>() },
    currentLabelsRef: { current: new Map<string, string>() },
    descriptionValue: 'hello world',
    enhancingAction: null,
    enhancingPostId: null,
    focusedPostId: null,
    getPostsService: vi.fn(),
    index: 0,
    isDraggable: true,
    lastSavedDescriptionsRef: { current: new Map<string, string>() },
    notificationsService: {},
    onDescriptionChange: vi.fn(),
    onDragEnd: vi.fn(),
    onDragStart: vi.fn(),
    onLabelChange: vi.fn(),
    onPromptEnhance: vi.fn(),
    onQuickAction: vi.fn(),
    onUpdateChild: vi.fn(),
    performAutoSaveForPost: vi.fn(),
    platform: Platform.TWITTER,
    post: {
      description: 'hello world',
      id: 'post-1',
      isDeleted: false,
    } as unknown as IPost,
    publishedDisplay: '',
    scope: PageScope.PUBLISHING,
    selectedMedia: [],
    setFocusedPostId: vi.fn(),
    ...overrides,
  } as unknown as PostDetailCardProps;
}

function buildDataTransfer() {
  return {
    effectAllowed: '',
    setData: vi.fn(),
  };
}

describe('PostDetailCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookResult = {
      handleSaveDescription: mockHandleSaveDescription,
      hasAnalytics: false,
      isEditable: true,
      isGrokTweet: false,
      isParent: true,
      isSavingLocal: false,
      isTwitter: true,
      localIngredients: [],
      openDeleteConfirm: mockOpenDeleteConfirm,
      placeholder: 'Write something',
    };
  });

  it('starts a drag with the post reorder payload', () => {
    const props = buildProps();
    const { container } = render(<PostDetailCard {...props} />);
    const dataTransfer = buildDataTransfer();

    fireEvent.dragStart(container.firstChild as HTMLElement, { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'application/x-post-reorder',
      'post-1',
    );
    expect(props.onDragStart).toHaveBeenCalledWith('post-1');
  });

  it('refuses to start a drag when the card is not editable', () => {
    hookResult = { ...hookResult, isEditable: false };
    const props = buildProps();
    const { container } = render(<PostDetailCard {...props} />);
    const dataTransfer = buildDataTransfer();

    fireEvent.dragStart(container.firstChild as HTMLElement, { dataTransfer });

    expect(dataTransfer.setData).not.toHaveBeenCalled();
    expect(props.onDragStart).not.toHaveBeenCalled();
  });

  it('dims the card when another post has focus', () => {
    const { container } = render(
      <PostDetailCard {...buildProps({ focusedPostId: 'other-post' })} />,
    );

    expect(container.firstChild).toHaveClass('opacity-80');
  });
});
