import {
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IngredientTileOverlays from './ingredient-tile-overlays';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@/components/ingredients/IngredientReviewActions', () => ({
  default: () => <div data-testid="review-actions" />,
}));

function makeIngredient(
  status: IngredientStatus,
  origin: IngredientOrigin = IngredientOrigin.GENERATED,
): IIngredient {
  return {
    id: 'ingredient-1',
    origin,
    status,
    tags: [],
  } as unknown as IIngredient;
}

describe('IngredientTileOverlays', () => {
  it('shows review actions but no origin badge on a completed generated tile', () => {
    render(
      <IngredientTileOverlays
        ingredient={makeIngredient(IngredientStatus.GENERATED)}
        isReviewEnabled
        onReviewUpdated={vi.fn()}
      />,
    );

    expect(screen.queryByText('Generated')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-actions')).toBeInTheDocument();
  });

  it('counts the images behind a carousel cover', () => {
    render(
      <IngredientTileOverlays
        ingredient={{
          ...makeIngredient(
            IngredientStatus.UPLOADED,
            IngredientOrigin.IMPORTED,
          ),
          stack: { count: 6, postId: 'post-1' },
        }}
        isReviewEnabled={false}
        onReviewUpdated={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Carousel of 6 images')).toBeInTheDocument();
  });

  it('badges a completed upload so it is not mistaken for generated output', () => {
    render(
      <IngredientTileOverlays
        ingredient={makeIngredient(
          IngredientStatus.UPLOADED,
          IngredientOrigin.UPLOADED,
        )}
        isReviewEnabled
        onReviewUpdated={vi.fn()}
      />,
    );

    expect(screen.getByText('Uploaded')).toBeInTheDocument();
  });

  it('hides the origin badge and review actions on a failed tile', () => {
    render(
      <IngredientTileOverlays
        ingredient={makeIngredient(
          IngredientStatus.FAILED,
          IngredientOrigin.UPLOADED,
        )}
        isReviewEnabled
        onReviewUpdated={vi.fn()}
      />,
    );

    expect(screen.queryByText('Uploaded')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-actions')).not.toBeInTheDocument();
  });

  it('hides the origin badge while the tile is still generating', () => {
    render(
      <IngredientTileOverlays
        ingredient={makeIngredient(
          IngredientStatus.PROCESSING,
          IngredientOrigin.UPLOADED,
        )}
        isReviewEnabled
        onReviewUpdated={vi.fn()}
      />,
    );

    expect(screen.queryByText('Uploaded')).not.toBeInTheDocument();
  });

  it('captions a finished tile with its title and duration', () => {
    render(
      <IngredientTileOverlays
        ingredient={
          {
            ...makeIngredient(IngredientStatus.GENERATED),
            category: IngredientCategory.VIDEO,
            metadata: { duration: 24, label: 'Founder intro' },
          } as IIngredient
        }
        isReviewEnabled={false}
        onReviewUpdated={vi.fn()}
      />,
    );

    expect(screen.getByText('Founder intro')).toBeInTheDocument();
    expect(screen.getByText('0:24')).toBeInTheDocument();
  });

  it('shows no duration on an image even when one was recorded for it', () => {
    render(
      <IngredientTileOverlays
        ingredient={
          {
            ...makeIngredient(IngredientStatus.GENERATED),
            category: IngredientCategory.IMAGE,
            metadata: { duration: 8, label: 'Winter look' },
          } as IIngredient
        }
        isReviewEnabled={false}
        onReviewUpdated={vi.fn()}
      />,
    );

    expect(screen.getByText('Winter look')).toBeInTheDocument();
    expect(screen.queryByText('0:08')).not.toBeInTheDocument();
  });

  it('leaves a still-generating tile uncaptioned', () => {
    render(
      <IngredientTileOverlays
        ingredient={
          {
            ...makeIngredient(IngredientStatus.PROCESSING),
            metadata: { label: 'Founder intro' },
          } as IIngredient
        }
        isReviewEnabled={false}
        onReviewUpdated={vi.fn()}
      />,
    );

    expect(screen.queryByText('Founder intro')).not.toBeInTheDocument();
  });
});
