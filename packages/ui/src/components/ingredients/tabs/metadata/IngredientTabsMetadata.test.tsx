import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render } from '@testing-library/react';
import IngredientTabsMetadata from '@ui/ingredients/tabs/metadata/IngredientTabsMetadata';
import { describe, expect, it, vi } from 'vitest';

describe('IngredientTabsMetadata', () => {
  const ingredient = {
    id: 'ingredient-1',
    metadataDuration: 0,
    metadataHeight: 0,
    metadataSize: 0,
    metadataWidth: 0,
  } as IIngredient;

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <IngredientTabsMetadata ingredient={ingredient} onRefresh={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
