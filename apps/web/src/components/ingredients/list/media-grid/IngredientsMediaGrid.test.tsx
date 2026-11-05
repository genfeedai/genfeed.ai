import {
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import IngredientsMediaGrid from '@/components/ingredients/list/media-grid/IngredientsMediaGrid';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: () => null,
}));

vi.mock('@ui/dropdowns/status/DropdownStatus', () => ({
  default: () => <div data-testid="status-dropdown" />,
}));

vi.mock('@/components/ingredients/IngredientReviewActions', () => ({
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

  it('labels uploaded cards with their origin in words, never intercepting a click', () => {
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
    const caption = uploaded.closest('[data-testid="ingredient-tile-caption"]');
    expect(caption?.parentElement).toContainElement(
      screen.getByTestId('image-tile-image-1'),
    );
    expect(screen.queryByText('Generated')).not.toBeInTheDocument();
    expect(caption).toHaveClass(
      'pointer-events-none',
      'opacity-100',
      '[@media(hover:hover)]:opacity-0',
      '[@media(hover:hover)]:group-hover:opacity-100',
      '[@media(hover:hover)]:group-focus-within:opacity-100',
    );
    expect(caption).not.toHaveClass('opacity-0');
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

  it('keeps mixed formats in source order inside the shared masonry', () => {
    const { container } = render(
      <IngredientsMediaGrid {...baseProps} items={items} />,
    );

    const masonry = container.querySelector('[data-masonry-layout="ordered"]');
    expect(masonry).toBeInTheDocument();
    expect(masonry).toHaveStyle({ gap: '8px', width: '100%' });
    const tiles = masonry?.querySelectorAll('[data-masonry-item]');
    expect(tiles).toHaveLength(2);
    expect(tiles?.[0]).toContainElement(
      screen.getByTestId('image-tile-image-1'),
    );
    expect(tiles?.[1]).toContainElement(
      screen.getByTestId('video-tile-video-1'),
    );
  });

  it('uses the same masonry spacing while assets are loading', () => {
    const { container } = render(
      <IngredientsMediaGrid {...baseProps} isLoading />,
    );
    const masonry = container.querySelector('[data-masonry-layout="ordered"]');
    expect(masonry).toHaveStyle({ gap: '8px' });
    expect(masonry?.querySelectorAll('[data-masonry-item]')).toHaveLength(12);
    expect(screen.queryByText('No assets found')).not.toBeInTheDocument();
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

  it('pulls only the first group over the page body padding', () => {
    render(
      <IngredientsMediaGrid
        {...baseProps}
        items={
          [
            { ...items[0], createdAt: '2026-09-20T12:00:00.000Z' },
            { ...items[1], createdAt: '2026-08-02T12:00:00.000Z' },
          ] as IIngredient[]
        }
      />,
    );

    const sections = screen
      .getAllByTestId('ingredient-time-group-heading')
      .map((heading) => heading.closest('section'));

    expect(sections).toHaveLength(2);
    expect(sections[0]).toHaveClass('first:-mt-5', 'sm:first:-mt-6');
    expect(sections[1]).toHaveClass('first:-mt-5');
    expect(sections[0]?.parentElement?.firstElementChild).toBe(sections[0]);
    expect(sections[1]?.parentElement?.firstElementChild).not.toBe(sections[1]);
  });

  it('renders loading skeletons while fetching items', () => {
    const { container } = render(
      <IngredientsMediaGrid {...baseProps} isLoading={true} />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  describe('audio, voice and text tiles', () => {
    const audioItem = {
      category: IngredientCategory.MUSIC,
      id: 'music-1',
      ingredientUrl: 'https://cdn.genfeed.ai/mock/theme.mp3',
      metadataLabel: 'Opening Theme',
      status: IngredientStatus.GENERATED,
    } as IIngredient;
    const voiceItem = {
      ...audioItem,
      category: IngredientCategory.VOICE,
      id: 'voice-1',
      metadataLabel: 'Narration Take',
    } as IIngredient;
    const textItem = {
      category: IngredientCategory.TEXT,
      id: 'text-1',
      metadataLabel: 'Launch caption',
      status: IngredientStatus.GENERATED,
      text: 'Ship the content, not the slide deck.',
    } as IIngredient;

    it('draws audio and voice as waveform tiles with a type badge', () => {
      render(
        <IngredientsMediaGrid {...baseProps} items={[audioItem, voiceItem]} />,
      );

      expect(
        screen.getByRole('button', { name: 'Play preview for Opening Theme' }),
      ).toBeEnabled();
      expect(
        screen.getByRole('button', { name: 'Play preview for Narration Take' }),
      ).toBeEnabled();
      expect(screen.getByText('Audio')).toBeInTheDocument();
      expect(screen.getByText('Voice')).toBeInTheDocument();
    });

    it('draws a text asset as a snippet card', () => {
      render(<IngredientsMediaGrid {...baseProps} items={[textItem]} />);

      expect(screen.getByText('Launch caption')).toBeInTheDocument();
      expect(
        screen.getByText('Ship the content, not the slide deck.'),
      ).toBeInTheDocument();
    });

    it('selects an audio tile through its toggle', () => {
      const onToggleSelection = vi.fn();
      render(
        <IngredientsMediaGrid
          {...baseProps}
          items={[audioItem]}
          onToggleSelection={onToggleSelection}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Select asset' }));

      expect(onToggleSelection).toHaveBeenCalledExactlyOnceWith(audioItem);
    });

    it('marks a selected tile as selected', () => {
      const { container } = render(
        <IngredientsMediaGrid
          {...baseProps}
          items={[textItem]}
          onToggleSelection={vi.fn()}
          selectedIds={[textItem.id]}
        />,
      );

      expect(
        container.querySelector('[data-masonry-item][data-selected="true"]'),
      ).not.toBeNull();
      expect(
        screen.getByRole('button', { name: 'Deselect asset' }),
      ).toBeInTheDocument();
    });

    it('opens the inspector from the tile and from its details button, not from the player', () => {
      const onClickIngredient = vi.fn();
      render(
        <IngredientsMediaGrid
          {...baseProps}
          items={[audioItem]}
          onClickIngredient={onClickIngredient}
        />,
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'Play preview for Opening Theme' }),
      );
      expect(onClickIngredient).not.toHaveBeenCalled();

      fireEvent.click(screen.getAllByText('Opening Theme')[0] as HTMLElement);
      expect(onClickIngredient).toHaveBeenCalledExactlyOnceWith(audioItem);

      fireEvent.click(
        screen.getByRole('button', { name: 'Open details for Opening Theme' }),
      );
      expect(onClickIngredient).toHaveBeenCalledTimes(2);
    });

    it('offers retry on a failed audio tile and keeps playback off', () => {
      const failed = {
        ...audioItem,
        generationError: 'Provider rejected the prompt.',
        status: IngredientStatus.FAILED,
      } as IIngredient;
      const onReprompt = vi.fn();
      render(
        <IngredientsMediaGrid
          {...baseProps}
          items={[failed]}
          onReprompt={onReprompt}
        />,
      );

      expect(screen.getByText('Provider rejected the prompt.')).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Play preview for Opening Theme' }),
      ).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Retry generation' }));

      expect(onReprompt).toHaveBeenCalledExactlyOnceWith(failed);
    });

    it('shows the status control and keeps playback off while processing', () => {
      render(
        <IngredientsMediaGrid
          {...baseProps}
          items={[{ ...audioItem, status: IngredientStatus.PROCESSING }]}
        />,
      );

      expect(screen.getByTestId('status-dropdown')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Play preview for Opening Theme' }),
      ).toBeDisabled();
    });
  });
});
