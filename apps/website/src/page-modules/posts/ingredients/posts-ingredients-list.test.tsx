import type { Ingredient } from '@models/content/ingredient.model';
import PostsIngredientsList from '@pages/posts/ingredients/posts-ingredients-list';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    <span
      aria-label={props.alt ?? ''}
      data-src={typeof props.src === 'string' ? props.src : undefined}
      role="img"
    />
  ),
}));

const COLLAGEN = {
  category: 'wellness',
  id: 'ingredient-1',
  metadataLabel: 'Collagen',
  totalPosts: 2,
  totalViews: 50,
} as Ingredient & { totalPosts: number; totalViews: number };

describe('PostsIngredientsList', () => {
  it('renders the page H1 and the empty state without ingredients', () => {
    render(<PostsIngredientsList ingredients={[]} />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Posts by Ingredient',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('No ingredients available')).toBeInTheDocument();
  });

  it('links each ingredient to its public posts page', () => {
    render(<PostsIngredientsList ingredients={[COLLAGEN]} />);

    expect(screen.getByRole('link', { name: /collagen/i })).toHaveAttribute(
      'href',
      '/posts/ingredient-1',
    );
    expect(screen.getByText('2 posts')).toBeInTheDocument();
    expect(screen.getByText('50 views')).toBeInTheDocument();
  });

  it('links to the other pages of the gallery', () => {
    render(
      <PostsIngredientsList
        ingredients={[COLLAGEN]}
        pagination={{ page: 1, total: 40, totalPages: 4 }}
      />,
    );

    expect(screen.getByText('40 ingredients')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to next page')).toHaveAttribute(
      'href',
      '?page=2',
    );
  });
});
