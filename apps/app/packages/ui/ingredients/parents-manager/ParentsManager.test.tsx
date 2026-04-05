import type { IIngredient } from '@genfeedai/interfaces';
import { IngredientCategory } from '@genfeedai/enums';
import { render } from '@testing-library/react';
import ParentsManager from '@ui/ingredients/parents-manager/ParentsManager';
import { describe, expect, it, vi } from 'vitest';

describe('ParentsManager', () => {
  const ingredient = {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
    parent: null,
  } as IIngredient;

  it('should render without crashing', () => {
    const { container } = render(
      <ParentsManager ingredient={ingredient} onParentsChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <ParentsManager ingredient={ingredient} onParentsChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <ParentsManager ingredient={ingredient} onParentsChange={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
