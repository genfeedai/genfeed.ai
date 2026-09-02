import '@testing-library/jest-dom/vitest';
import { Platform, PostStatus } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
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
  useParams: () => ({ brandSlug: 'paperclip', orgSlug: 'genfeed-ai' }),
  usePathname: () => '/genfeed-ai/paperclip/publishing',
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => new URLSearchParams(''),
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
  ingredients: [
    {
      cdnUrl: 'https://cdn.example.com/tweet-image.jpg',
      id: 'ingredient-1',
      metadataLabel: 'Tweet image',
    },
  ],
  platform: Platform.TWITTER,
  platformUrl: 'https://x.com/genfeedai/status/123',
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
    expect(screen.getByRole('button', { name: /evaluate/i })).toBeVisible();
    expect(screen.getByRole('link', { name: /view on x/i })).toHaveAttribute(
      'href',
      basePost.platformUrl,
    );
  });

  it('renders attached tweet media in the card', () => {
    render(
      <PostsGrid
        posts={[basePost]}
        onPostEvaluated={vi.fn()}
        primaryAction={primaryAction}
      />,
    );

    expect(screen.getByRole('img', { name: /tweet image/i })).toHaveAttribute(
      'src',
      expect.stringContaining('tweet-image.jpg'),
    );
  });

  it('links each card to the post detail route', () => {
    render(
      <PostsGrid
        posts={[basePost]}
        onPostEvaluated={vi.fn()}
        primaryAction={primaryAction}
      />,
    );

    // A real anchor, not a click handler: the router prefetches the detail
    // route before the click and cmd-click opens it in a new tab.
    // `useOrgUrl` scopes the href to the active org/brand route params.
    expect(
      screen.getByRole('link', { name: /a draft post preview/i }),
    ).toHaveAttribute('href', '/genfeed-ai/paperclip/publishing/posts/post-1');
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
    // The callback opens a modal in place, so the heading stays a button.
    expect(
      screen.queryByRole('link', { name: /a draft post preview/i }),
    ).not.toBeInTheDocument();
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
