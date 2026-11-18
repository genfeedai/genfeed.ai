import type { Post } from '@models/content/post.model';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CreatorPostMetrics from './CreatorPostMetrics';

function postWith(counts: Partial<Post>): Post {
  return { id: 'post-1', ...counts } as Post;
}

describe('CreatorPostMetrics', () => {
  it('shows likes, comments and reposts', () => {
    render(
      <CreatorPostMetrics
        post={postWith({ totalComments: 86, totalLikes: 1240, totalShares: 1 })}
      />,
    );

    expect(screen.getByText('1.2K')).toBeInTheDocument();
    expect(screen.getByText('1240 likes')).toBeInTheDocument();
    expect(screen.getByText('86 comments')).toBeInTheDocument();
    expect(screen.getByText('1 repost')).toBeInTheDocument();
  });

  it('never shows the view count', () => {
    const { container } = render(
      <CreatorPostMetrics
        post={postWith({ totalLikes: 3, totalViews: 9000 })}
      />,
    );

    expect(container).not.toHaveTextContent('9');
    expect(screen.queryByText(/view/i)).toBeNull();
  });

  it('shows nothing for a post nobody has reacted to', () => {
    const { container } = render(<CreatorPostMetrics post={postWith({})} />);

    expect(container).toBeEmptyDOMElement();
  });
});
