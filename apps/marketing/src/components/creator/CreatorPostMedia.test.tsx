import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CreatorPostMedia from './CreatorPostMedia';

describe('CreatorPostMedia', () => {
  it('shows a single image under the post title', () => {
    render(
      <CreatorPostMedia
        alt="Launch day"
        media={[
          { id: 'a', kind: 'image', url: 'https://cdn.genfeed.ai/a.png' },
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: 'Launch day' })).toHaveAttribute(
      'src',
      'https://cdn.genfeed.ai/a.png',
    );
  });

  it('numbers several items and plays videos inline', () => {
    const { container } = render(
      <CreatorPostMedia
        alt="Launch day"
        media={[
          { id: 'a', kind: 'image', url: 'https://cdn.genfeed.ai/a.png' },
          { id: 'b', kind: 'video', url: 'https://cdn.genfeed.ai/b.mp4' },
        ]}
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Launch day (1)' }),
    ).toBeInTheDocument();
    expect(container.querySelector('video')).toHaveAttribute(
      'aria-label',
      'Launch day (video 2)',
    );
  });

  it('renders nothing for a text post', () => {
    const { container } = render(<CreatorPostMedia alt="Note" media={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
