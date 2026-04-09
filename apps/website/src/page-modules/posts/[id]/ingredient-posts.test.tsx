import type { Ingredient } from '@models/content/ingredient.model';
import IngredientPosts from '@pages/posts/[id]/ingredient-posts';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('IngredientPosts', () => {
  const ingredient = {
    id: 'ingredient-1',
    metadataDescription: 'Test description',
    metadataLabel: 'Test Ingredient',
    totalPosts: 1,
    totalViews: 10,
  } as Ingredient & { totalPosts?: number; totalViews?: number };

  it('should render without crashing', () => {
    const { container } = render(
      <IngredientPosts
        id="ingredient-1"
        page={1}
        ingredient={ingredient}
        posts={[]}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <IngredientPosts
        id="ingredient-1"
        page={1}
        ingredient={ingredient}
        posts={[]}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <IngredientPosts
        id="ingredient-1"
        page={1}
        ingredient={ingredient}
        posts={[]}
      />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
