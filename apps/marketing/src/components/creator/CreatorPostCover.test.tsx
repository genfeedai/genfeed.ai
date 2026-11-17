import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CreatorPostCover from './CreatorPostCover';

describe('CreatorPostCover', () => {
  it('shows one image without a carousel', () => {
    const { container } = render(
      <CreatorPostCover
        images={[
          { id: 'a', kind: 'image', url: 'https://cdn.genfeed.ai/a.png' },
        ]}
      />,
    );

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.genfeed.ai/a.png',
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('swipes through every slide of a carousel post', () => {
    const { container } = render(
      <CreatorPostCover
        images={[
          { id: 'a', kind: 'image', url: 'https://cdn.genfeed.ai/a.png' },
          { id: 'b', kind: 'image', url: 'https://cdn.genfeed.ai/b.png' },
        ]}
      />,
    );

    expect(screen.getByRole('region', { name: 'Post images' })).toHaveAttribute(
      'aria-roledescription',
      'carousel',
    );
    expect(
      [...container.querySelectorAll('img')].map((img) =>
        img.getAttribute('src'),
      ),
    ).toEqual(['https://cdn.genfeed.ai/a.png', 'https://cdn.genfeed.ai/b.png']);
  });

  it('renders nothing without images', () => {
    const { container } = render(<CreatorPostCover images={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
