import type { CreatorWallTileProps } from '@props/content/creator.props';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CreatorWallTile from './CreatorWallTile';

const brand = { id: 'b1', logoUrl: 'https://cdn.example.com/logo.png' };

function renderTile(post: Record<string, unknown>) {
  return render(
    <CreatorWallTile
      brand={brand as CreatorWallTileProps['brand']}
      handle="shayla"
      post={
        {
          createdAt: '2026-11-09T10:00:00Z',
          id: 'post-1',
          ...post,
        } as CreatorWallTileProps['post']
      }
    />,
  );
}

const image = (id: string) => ({
  category: 'image',
  id,
  ingredientUrl: `https://cdn.example.com/${id}.png`,
  status: 'generated',
});

describe('CreatorWallTile', () => {
  it('shows a carousel as its first picture with the slide count', () => {
    const { container } = renderTile({
      description: 'Snow day in the city',
      ingredients: [image('a'), image('b'), image('c')],
      label: 'Winter carousel',
      platform: 'instagram',
    });

    const link = screen.getByRole('link', {
      name: 'Instagram: Winter carousel',
    });
    expect(link.getAttribute('href')).toBe('/@shayla/posts/post-1');
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.example.com/a.png',
    );
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('draws a post with no media as a text tile', () => {
    const { container } = renderTile({
      description: 'Hot take: walk to brief.',
      platform: 'twitter',
    });

    expect(
      container.querySelector('img[src^="https://cdn.example.com/a"]'),
    ).toBeNull();
    expect(screen.getByText('Hot take: walk to brief.')).toBeTruthy();
    expect(screen.getByText('@shayla')).toBeTruthy();
  });
});
