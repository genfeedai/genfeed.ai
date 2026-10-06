import {
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import IngredientsMediaGrid from '@ui/ingredients/list/media-grid/IngredientsMediaGrid';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/ingredients/IngredientReviewActions', () => ({
  default: () => <div data-testid="asset-review-actions" />,
}));

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

  it('labels every card with its origin in words, never intercepting a click', () => {
    render(
      <IngredientsMediaGrid
        {...baseProps}
        items={[
          { ...items[0], origin: IngredientOrigin.UPLOADED },
          { ...items[1], origin: IngredientOrigin.GENERATED },
        ]}
      />,
    );

    const uploaded = screen.getByText('Uploaded');
    const generated = screen.getByText('Generated');
    expect(uploaded.parentElement).toContainElement(
      screen.getByTestId('image-tile-image-1'),
    );
    expect(generated.parentElement).toContainElement(
      screen.getByTestId('video-tile-video-1'),
    );
    expect(uploaded).toHaveClass('pointer-events-none');
    expect(generated).toHaveClass(
      'pointer-events-none',
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100',
    );
  });

  it('shows each card’s tags above its origin, never intercepting a click', () => {
    render(
      <IngredientsMediaGrid
        {...baseProps}
        items={
          [
            {
              ...items[0],
              origin: IngredientOrigin.UPLOADED,
              tags: [
                { backgroundColor: '#000000', id: 'tag-1', label: 'S1E12' },
                { backgroundColor: '#112233', id: 'tag-2', label: 'Launch' },
              ],
            },
            {
              ...items[1],
              tags: [
                { backgroundColor: '#000000', id: 'tag-3', label: 'Mood' },
              ],
            },
          ] as IIngredient[]
        }
      />,
    );

    const list = screen.getAllByRole('list', { name: 'Tags' })[0];
    expect(list).toHaveClass('pointer-events-none');
    expect(list?.parentElement).toContainElement(
      screen.getByTestId('image-tile-image-1'),
    );
    expect(screen.getByText('S1E12')).toBeInTheDocument();
    expect(screen.getByText('Launch')).toBeInTheDocument();
    expect(screen.getByText('Mood')).toBeInTheDocument();
  });

  it('adds no tag row to an untagged card', () => {
    render(<IngredientsMediaGrid {...baseProps} items={items} />);

    expect(
      screen.queryByRole('list', { name: 'Tags' }),
    ).not.toBeInTheDocument();
  });

  it('adds no label to a legacy card that has no origin yet', () => {
    render(<IngredientsMediaGrid {...baseProps} items={items} />);

    expect(screen.queryByText('Uploaded')).not.toBeInTheDocument();
    expect(screen.queryByText('Generated')).not.toBeInTheDocument();
  });

  it('deals tiles across columns left to right so newest-first order reads across', () => {
    const { container } = render(
      <IngredientsMediaGrid {...baseProps} items={items} />,
    );

    const columns = container.querySelectorAll<HTMLElement>(
      '[data-masonry-column]',
    );

    expect(columns).toHaveLength(5);
    expect(columns[0]).toContainElement(
      screen.getByTestId('image-tile-image-1'),
    );
    expect(columns[1]).toContainElement(
      screen.getByTestId('video-tile-video-1'),
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

  it('docks a chronological group on the pinned section bar', () => {
    render(
      <IngredientsMediaGrid
        {...baseProps}
        items={
          [
            { ...items[0], createdAt: '2026-09-20T12:00:00.000Z' },
            { ...items[1], createdAt: '2026-09-02T12:00:00.000Z' },
          ] as IIngredient[]
        }
      />,
    );

    const heading = screen.getByTestId('ingredient-time-group-heading');

    expect(heading).toHaveTextContent('September 2026');
    expect(heading).toHaveTextContent('· 2');
    expect(heading).toHaveClass('bg-background', 'sticky');
    expect(heading.className).not.toContain('backdrop-blur');
    expect(heading.getAttribute('style')).toContain(
      'var(--pinned-topbar-height, 0px)',
    );
  });

  it('renders loading skeletons while fetching items', () => {
    const { container } = render(
      <IngredientsMediaGrid {...baseProps} isLoading={true} />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });
});
