import type { IIngredient } from '@genfeedai/interfaces';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import IngredientsMediaGrid from '@ui/ingredients/list/media-grid/IngredientsMediaGrid';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/lazy/masonry/LazyMasonry', () => ({
  LazyMasonryImage: ({ image }: { image: { id: string } }) => (
    <div data-testid={`image-tile-${image.id}`} />
  ),
  LazyMasonryVideo: ({ video }: { video: { id: string } }) => (
    <div data-testid={`video-tile-${video.id}`} />
  ),
}));

const baseProps = {
  emptyLabel: 'No assets found',
  isActionsEnabled: true,
  isDragEnabled: false,
  isGeneratingCaptions: false,
  isLoading: false,
  isPortraiting: false,
  items: [],
  onClickIngredient: vi.fn(),
  onConvertToPortrait: vi.fn(),
  onDeleteIngredient: vi.fn(),
  onGenerateCaptions: vi.fn(),
  onMarkArchived: vi.fn(),
  onPublishIngredient: vi.fn(),
  onRefresh: vi.fn(),
  onSeeDetails: vi.fn(),
  onUpdateParent: vi.fn(),
  selectedIds: [],
};

describe('IngredientsMediaGrid', () => {
  it('renders the empty state label', () => {
    render(<IngredientsMediaGrid {...baseProps} />);

    expect(screen.getByText('No assets found')).toBeInTheDocument();
  });

  it('renders image and video tiles in the shared grid', () => {
    const items = [
      {
        category: IngredientCategory.IMAGE,
        id: 'image-1',
        ingredientUrl: '/image-1.png',
        metadata: { height: 1200, width: 900 },
        status: IngredientStatus.GENERATED,
      },
      {
        category: IngredientCategory.VIDEO,
        id: 'video-1',
        ingredientUrl: '/video-1.mp4',
        metadata: { height: 1920, width: 1080 },
        status: IngredientStatus.GENERATED,
      },
    ] as IIngredient[];

    render(<IngredientsMediaGrid {...baseProps} items={items} />);

    expect(screen.getByTestId('image-tile-image-1')).toBeInTheDocument();
    expect(screen.getByTestId('video-tile-video-1')).toBeInTheDocument();
  });

  it('renders loading skeletons while fetching items', () => {
    const { container } = render(
      <IngredientsMediaGrid {...baseProps} isLoading={true} />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });
});
