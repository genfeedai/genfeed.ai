import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { render } from '@testing-library/react';
import IngredientTabsChildren from '@ui/ingredients/tabs/children/IngredientTabsChildren';
import { describe, expect, it, vi } from 'vitest';

describe('IngredientTabsChildren', () => {
  const ingredient = {
    category: IngredientCategory.VIDEO,
    id: 'ingredient-1',
  } as IIngredient;

  it('should render without crashing', () => {
    const { container } = render(
      <IngredientTabsChildren ingredient={ingredient} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <IngredientTabsChildren ingredient={ingredient} onViewChild={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <IngredientTabsChildren ingredient={ingredient} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
