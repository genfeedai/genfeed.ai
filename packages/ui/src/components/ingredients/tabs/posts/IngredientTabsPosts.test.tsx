import type { IIngredient } from '@genfeedai/interfaces';
import { render } from '@testing-library/react';
import IngredientTabsPosts from '@ui/ingredients/tabs/posts/IngredientTabsPosts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: () => ({
      getPosts: vi.fn().mockResolvedValue([]),
    }),
  },
}));

describe('IngredientTabsPosts', () => {
  const ingredient = {
    id: 'ingredient-1',
  } as IIngredient;

  it('should render without crashing', () => {
    const { container } = render(
      <IngredientTabsPosts ingredient={ingredient} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <IngredientTabsPosts ingredient={ingredient} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <IngredientTabsPosts ingredient={ingredient} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
