import { IngredientOrigin, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IngredientTileOverlays from './ingredient-tile-overlays';

vi.mock('@ui/ingredients/IngredientReviewActions', () => ({
  default: () => <div data-testid="review-actions" />,
}));

function makeIngredient(status: IngredientStatus): IIngredient {
  return {
    id: 'ingredient-1',
    origin: IngredientOrigin.GENERATED,
    status,
    tags: [],
  } as unknown as IIngredient;
}

describe('IngredientTileOverlays', () => {
  it('shows the origin badge and review actions on a completed tile', () => {
    render(
      <IngredientTileOverlays
        ingredient={makeIngredient(IngredientStatus.GENERATED)}
        isReviewEnabled
        onReviewUpdated={vi.fn()}
      />,
    );

    expect(screen.getByText('Generated')).toBeInTheDocument();
    expect(screen.getByTestId('review-actions')).toBeInTheDocument();
  });

  it('hides the origin badge and review actions on a failed tile', () => {
    render(
      <IngredientTileOverlays
        ingredient={makeIngredient(IngredientStatus.FAILED)}
        isReviewEnabled
        onReviewUpdated={vi.fn()}
      />,
    );

    expect(screen.queryByText('Generated')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-actions')).not.toBeInTheDocument();
  });

  it('hides the origin badge while the tile is still generating', () => {
    render(
      <IngredientTileOverlays
        ingredient={makeIngredient(IngredientStatus.PROCESSING)}
        isReviewEnabled
        onReviewUpdated={vi.fn()}
      />,
    );

    expect(screen.queryByText('Generated')).not.toBeInTheDocument();
  });
});
