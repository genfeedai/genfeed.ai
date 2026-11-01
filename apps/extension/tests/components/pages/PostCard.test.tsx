import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import PostCard from '~components/pages/PostCard';

const OriginalImage = window.Image;

/** jsdom never loads images; this one loads or fails by the URL it is given. */
class FakeImage extends EventTarget {
  complete = false;
  crossOrigin: string | null = null;
  referrerPolicy = '';

  set src(url: string) {
    queueMicrotask(() => {
      this.dispatchEvent(new Event(url.includes('broken') ? 'error' : 'load'));
    });
  }
}

const post = {
  authorHandle: '@ada',
  authorName: 'Ada',
  avatarUrl: 'https://pbs.twimg.com/profile_images/1/a.jpg',
  text: 'We just launched.',
  url: 'https://x.com/ada/status/1',
};

describe('PostCard', () => {
  beforeEach(() => {
    window.Image = FakeImage as unknown as typeof window.Image;
  });

  afterEach(() => {
    window.Image = OriginalImage;
  });

  it('shows the author avatar', async () => {
    const { container } = render(<PostCard post={post} />);

    await waitFor(() => {
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        post.avatarUrl,
      );
    });
  });

  it('falls back to the initial when the avatar cannot load', async () => {
    const { container } = render(
      <PostCard
        post={{ ...post, avatarUrl: 'https://pbs.twimg.com/broken.jpg' }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });
    expect(container.querySelector('img')).toBeNull();
  });
});
