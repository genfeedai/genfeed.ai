import type { Ingredient } from '@models/content/ingredient.model';
import type { Post } from '@models/content/post.model';
import IngredientPosts from '@pages/posts/[id]/ingredient-posts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('IngredientPosts', () => {
  const ingredient = {
    id: 'ingredient-1',
    metadataDescription: 'Test description',
    metadataLabel: 'Test Ingredient',
    totalPosts: 1,
    totalViews: 10,
  } as Ingredient & { totalPosts?: number; totalViews?: number };

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <IngredientPosts id="ingredient-1" ingredient={ingredient} posts={[]} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('links to the other pages of posts', () => {
    render(
      <IngredientPosts
        id="ingredient-1"
        ingredient={ingredient}
        pagination={{ page: 2, total: 30, totalPages: 3 }}
        posts={[{ id: 'post-1', label: 'First post' } as Post]}
      />,
    );

    expect(screen.getByText('30 posts')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '3' })).toHaveAttribute(
      'href',
      '?page=3',
    );
    expect(screen.getByLabelText('Go to previous page')).toHaveAttribute(
      'href',
      '?page=1',
    );
  });
});
