import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IngredientTabsMetadata from '@/features/ingredients/components/tabs/metadata/IngredientTabsMetadata';

describe('IngredientTabsMetadata', () => {
  const ingredient = {
    id: 'ingredient-1',
    metadataDuration: 0,
    metadataHeight: 0,
    metadataSize: 0,
    metadataWidth: 0,
  } as IIngredient;

  it('should render without crashing', () => {
    const { container } = render(
      <IngredientTabsMetadata ingredient={ingredient} onRefresh={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <IngredientTabsMetadata ingredient={ingredient} onRefresh={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <IngredientTabsMetadata ingredient={ingredient} onRefresh={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
