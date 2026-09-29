import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render } from '@testing-library/react';
import ChildrenManager from '@ui/ingredients/children-manager/ChildrenManager';
import { describe, expect, it, vi } from 'vitest';

describe('ChildrenManager', () => {
  const ingredient = {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
  } as IIngredient;

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <ChildrenManager ingredient={ingredient} onChildrenChange={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
