import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import IngredientsMediaGrid from '@ui/ingredients/list/media-grid/IngredientsMediaGrid';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@ui/lazy/masonry/LazyMasonry', () => ({
  LazyMasonryImage: ({
    image,
    onToggleSelection,
  }: {
    image: { id: string };
    onToggleSelection?: (ingredient: { id: string }) => void;
  }) => (
    <button
      type="button"
      data-testid={`image-tile-${image.id}`}
      onClick={() => onToggleSelection?.(image)}
    />
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

const items = [
  {
    category: IngredientCategory.IMAGE,
    id: 'image-1',
    metadata: { height: 1200, width: 900 },
    metadataLabel: 'Campaign still',
    metadataModelLabel: 'Flux',
    status: IngredientStatus.GENERATED,
  },
  {
    category: IngredientCategory.VIDEO,
    id: 'video-1',
    metadata: { height: 1920, width: 1080 },
    status: IngredientStatus.GENERATED,
  },
] as IIngredient[];

describe('IngredientsMediaGrid', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
      writable: true,
    });
  });

  it('renders the empty state label', () => {
    render(<IngredientsMediaGrid {...baseProps} />);

    expect(screen.getByText('No assets found')).toBeInTheDocument();
  });

  it('renders image and video tiles in the shared grid', () => {
    render(<IngredientsMediaGrid {...baseProps} items={items} />);

    expect(screen.getByTestId('image-tile-image-1')).toBeInTheDocument();
    expect(screen.getByTestId('video-tile-video-1')).toBeInTheDocument();
  });

  it('lays tiles out in CSS columns so ratios stay intact', () => {
    const { container } = render(
      <IngredientsMediaGrid {...baseProps} items={items} />,
    );

    const column = container.querySelector<HTMLElement>('[style*="column"]');

    expect(column?.style.columnCount).toBe('5');
    expect(screen.getByTestId('image-tile-image-1').parentElement).toHaveClass(
      'break-inside-avoid',
    );
  });

  it('reports selection toggles from a tile', () => {
    const onToggleSelection = vi.fn();

    render(
      <IngredientsMediaGrid
        {...baseProps}
        items={items}
        onToggleSelection={onToggleSelection}
      />,
    );

    fireEvent.click(screen.getByTestId('image-tile-image-1'));

    expect(onToggleSelection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'image-1' }),
    );
  });

  it('renders loading skeletons while fetching items', () => {
    const { container } = render(
      <IngredientsMediaGrid {...baseProps} isLoading={true} />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });
});
