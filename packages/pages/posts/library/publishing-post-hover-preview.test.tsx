import '@testing-library/jest-dom/vitest';
import type { IPost } from '@genfeedai/contracts/interfaces';
import PublishingPostHoverPreview from '@pages/posts/library/publishing-post-hover-preview';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findOne: vi.fn() }));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
const getService = async () => ({ findOne: mocks.findOne });

const fallback = { caption: 'Review summary', platform: 'twitter' };

describe('PublishingPostHoverPreview lazy post details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOne.mockResolvedValue({
      id: 'post-1',
      description: 'Full caption from the actual post',
      platform: 'twitter',
      ingredients: [
        {
          id: 'asset-1',
          category: 'IMAGE',
          ingredientUrl: 'https://cdn.example.com/post.jpg',
        },
      ],
      credential: {
        externalName: 'Vincent',
        externalHandle: 'VincentShipsIt',
      },
    } as IPost);
  });

  it('loads the actual post only when the preview opens, including its author', async () => {
    render(
      <PublishingPostHoverPreview postId="post-1" target={fallback}>
        <a href="/review">Review post</a>
      </PublishingPostHoverPreview>,
    );
    expect(mocks.findOne).not.toHaveBeenCalled();
    fireEvent.focus(screen.getByRole('link', { name: 'Review post' }));
    expect(
      await screen.findByText('Full caption from the actual post'),
    ).toBeVisible();
    expect(screen.getByText('Vincent')).toBeVisible();
    expect(screen.getByText('@VincentShipsIt')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Media 1' })).toHaveAttribute(
      'src',
      expect.stringContaining('post.jpg'),
    );
    expect(mocks.findOne).toHaveBeenCalledExactlyOnceWith(
      'post-1',
      {},
      expect.any(AbortSignal),
    );
  });

  it('shows the summary and an honest error when the full post cannot load', async () => {
    mocks.findOne.mockRejectedValueOnce(new Error('unavailable'));
    render(
      <PublishingPostHoverPreview postId="post-1" target={fallback}>
        <a href="/review">Review post</a>
      </PublishingPostHoverPreview>,
    );
    fireEvent.focus(screen.getByRole('link', { name: 'Review post' }));
    expect(
      await screen.findByText(
        'Full post preview unavailable. Open the post to review it.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Review summary')).toBeVisible();
  });

  it('aborts detail loading when the preview is removed', async () => {
    mocks.findOne.mockImplementationOnce(() => new Promise(() => {}));
    const { unmount } = render(
      <PublishingPostHoverPreview postId="post-1" target={fallback}>
        <a href="/review">Review post</a>
      </PublishingPostHoverPreview>,
    );
    fireEvent.focus(screen.getByRole('link', { name: 'Review post' }));
    await waitFor(() => expect(mocks.findOne).toHaveBeenCalledTimes(1));
    const signal = mocks.findOne.mock.calls[0][2] as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
