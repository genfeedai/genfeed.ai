import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', async () => ({
  default: (await import('~components/ui/NextImage')).default,
}));

import PostCard from '~components/pages/PostCard';

const post = {
  authorHandle: '@ada',
  authorName: 'Ada',
  avatarUrl: 'https://pbs.twimg.com/profile_images/1/a.jpg',
  text: 'We just launched.',
  url: 'https://x.com/ada/status/1',
};

describe('PostCard', () => {
  it('shows the author avatar', () => {
    const { container } = render(<PostCard post={post} />);

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      post.avatarUrl,
    );
  });

  it('falls back to the initial when the avatar cannot load', () => {
    const { container } = render(<PostCard post={post} />);

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});
