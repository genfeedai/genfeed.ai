import '@testing-library/jest-dom/vitest';
import { Platform, PostStatus } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import PostsGrid, {
  type PostCardAction,
} from '@pages/posts/list/components/PostsGrid';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const evaluateMock = vi.fn();
const primaryActionOnClick = vi.fn();
const deleteActionOnClick = vi.fn();
const openPostDetailMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@hooks/ui/evaluation/use-evaluation/use-evaluation', () => ({
  useEvaluation: () => ({
    evaluate: evaluateMock,
    evaluation: null,
    isEvaluating: false,
  }),
}));

const primaryAction: PostCardAction = {
  icon: <>E</>,
  key: 'edit',
  label: 'Edit post',
  onClick: primaryActionOnClick,
};

const deleteAction: PostCardAction = {
  destructive: true,
  icon: <>D</>,
  key: 'delete',
  label: 'Delete post',
  onClick: deleteActionOnClick,
};

const basePost = {
  description: 'A draft post preview that should render cleanly.',
  id: 'post-1',
  platform: Platform.TWITTER,
  status: PostStatus.DRAFT,
} as IPost;

describe('PostsGrid', () => {
  beforeEach(() => {
    pushMock.mockReset();
    evaluateMock.mockReset();
    primaryActionOnClick.mockReset();
    deleteActionOnClick.mockReset();
    openPostDetailMock.mockReset();
    global.ResizeObserver = class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    } as typeof ResizeObserver;
  });

  it('renders a primary edit action without a visible delete button', () => {
    render(
      <PostsGrid
        posts={[basePost]}
        onPostEvaluated={vi.fn()}
        primaryAction={primaryAction}
        secondaryActions={[deleteAction]}
      />,
    );

    const editButton = screen
      .getAllByRole('button', { name: /edit post/i })
      .find((element) => element.tagName === 'BUTTON');

    expect(editButton).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /delete post/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('opens post details on card click', () => {
    render(
      <PostsGrid
        posts={[basePost]}
        onPostEvaluated={vi.fn()}
        primaryAction={primaryAction}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /a draft post preview/i }),
    );

    expect(pushMock).toHaveBeenCalledWith('/posts/post-1');
  });

  it('uses the contextual open callback when provided', () => {
    render(
      <PostsGrid
        posts={[basePost]}
        onPostEvaluated={vi.fn()}
        onOpenPostDetail={openPostDetailMock}
        primaryAction={primaryAction}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /a draft post preview/i }),
    );

    expect(openPostDetailMock).toHaveBeenCalledWith(basePost);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('keeps delete inside the overflow menu', () => {
    render(
      <PostsGrid
        posts={[basePost]}
        onPostEvaluated={vi.fn()}
        primaryAction={primaryAction}
        secondaryActions={[deleteAction]}
      />,
    );

    const trigger = screen.getByRole('button', { name: /more post actions/i });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: /delete post/i }));

    expect(deleteActionOnClick).toHaveBeenCalledWith(basePost);
  });
});
