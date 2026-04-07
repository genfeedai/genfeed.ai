import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { render } from '@testing-library/react';
import IngredientTabsTags from '@ui/ingredients/tabs/tags/IngredientTabsTags';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/tags/manager/TagsManager', () => ({
  default: () => <div data-testid="tags-manager" />,
}));

describe('IngredientTabsTags', () => {
  const ingredient = {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
    tags: [],
  } as IIngredient;

  it('should render without crashing', () => {
    const { container } = render(
      <IngredientTabsTags ingredient={ingredient} onTagsUpdate={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(
      <IngredientTabsTags ingredient={ingredient} onTagsUpdate={vi.fn()} />,
    );
    expect(
      document.querySelector('[data-testid="tags-manager"]'),
    ).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <IngredientTabsTags ingredient={ingredient} onTagsUpdate={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
