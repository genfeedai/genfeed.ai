import { IngredientCategory, ModalEnum, PageScope } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import IngredientsListContent from '@ui/ingredients/list/content/IngredientsListContent';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/dropdowns/status/DropdownStatus', () => ({
  default: () => <div data-testid="status-dropdown" />,
}));

vi.mock('@ui/ingredients/list/media-grid/IngredientsMediaGrid', () => ({
  default: ({
    items,
    onClickIngredient,
  }: {
    items: IIngredient[];
    onClickIngredient: (ingredient: IIngredient) => void;
  }) => (
    <button
      data-testid="media-grid-item"
      onClick={() => onClickIngredient(items[0])}
      type="button"
    >
      {items[0]?.metadataLabel ?? 'Media item'}
    </button>
  ),
}));

const baseIngredient = {
  category: IngredientCategory.AVATAR,
  createdAt: new Date().toISOString(),
  id: 'avatar-source-1',
  ingredientUrl: 'https://cdn.genfeed.ai/mock/avatar-source.jpg',
  metadataLabel: 'Avatar Source',
  status: 'GENERATED',
  updatedAt: new Date().toISOString(),
} as unknown as IIngredient;

/**
 * The inspector reads the viewport through `matchMedia`, so a test picks its
 * presentation by answering that query rather than by asserting on a class.
 */
function mockInspectorViewport(isDocked: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        addEventListener: vi.fn(),
        matches: isDocked,
        media: query,
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function renderContent(
  overrides: Partial<ComponentProps<typeof IngredientsListContent>> = {},
) {
  const onOpenIngredientModal = vi.fn();
  const onOpenLightbox = vi.fn(() => false);

  render(
    <IngredientsListContent
      type="avatars"
      scope={PageScope.ORGANIZATION}
      singularType={IngredientCategory.AVATAR}
      formatFilter={undefined}
      isLoading={false}
      filteredIngredients={[baseIngredient]}
      hasFilteredEmptyState={false}
      selectedIngredientIds={[]}
      isActionsEnabled={true}
      isDragEnabled={false}
      isPortraiting={false}
      isGeneratingCaptions={false}
      isMirroring={false}
      isReversing={false}
      onSelectionChange={vi.fn()}
      onDeleteIngredient={vi.fn()}
      onArchiveIngredient={vi.fn()}
      onConvertToPortrait={vi.fn()}
      onGenerateCaptions={vi.fn()}
      onReverse={vi.fn()}
      onMirror={vi.fn()}
      onSeeDetails={vi.fn()}
      onUpdateParent={vi.fn()}
      onRefresh={vi.fn()}
      onPublishIngredient={vi.fn()}
      onOpenIngredientModal={onOpenIngredientModal}
      onOpenLightbox={onOpenLightbox}
      onClearFilters={vi.fn()}
      onSetIngredients={vi.fn()}
      onScopeChange={vi.fn()}
      onConvertToVideo={vi.fn()}
      onCopyPrompt={vi.fn()}
      onReprompt={vi.fn()}
      {...overrides}
    />,
  );

  return { onOpenIngredientModal, onOpenLightbox };
}

const videoIngredient = {
  category: IngredientCategory.VIDEO,
  createdAt: new Date().toISOString(),
  id: 'video-1',
  ingredientFormat: 'landscape',
  ingredientUrl: 'https://cdn.genfeed.ai/mock/clip.mp4',
  metadataLabel: 'A red apple on a table',
  status: 'GENERATED',
  thumbnailUrl: 'https://cdn.genfeed.ai/mock/clip-poster.jpg',
  updatedAt: new Date().toISOString(),
} as unknown as IIngredient;

const musicIngredient = {
  category: IngredientCategory.MUSIC,
  createdAt: new Date().toISOString(),
  id: 'music-1',
  ingredientUrl: 'https://cdn.genfeed.ai/mock/theme.mp3',
  metadataLabel: 'Opening Theme',
  status: 'GENERATED',
  updatedAt: new Date().toISOString(),
} as unknown as IIngredient;

describe('IngredientsListContent', () => {
  it('renders generic Library media as a contact sheet in grid mode', () => {
    const { onOpenLightbox } = renderContent({
      filteredIngredients: [videoIngredient],
      singularType: IngredientCategory.INGREDIENT,
      type: 'ingredients',
      viewMode: 'grid',
    });

    expect(screen.getByTestId('media-grid-item')).toHaveTextContent(
      'A red apple on a table',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('media-grid-item'));

    expect(onOpenLightbox).toHaveBeenCalledWith(videoIngredient);
  });

  it('honors the Library list control for visual assets', () => {
    renderContent({
      filteredIngredients: [videoIngredient],
      singularType: IngredientCategory.INGREDIENT,
      type: 'ingredients',
      viewMode: 'list',
    });

    expect(
      screen.getByRole('img', { name: 'A red apple on a table' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('media-grid-item')).not.toBeInTheDocument();
  });

  it('renders avatar rows in the table view', () => {
    renderContent();

    expect(screen.getByText('Avatar Source')).toBeInTheDocument();
  });

  it('renders a video poster instead of the mp4 and a muted Video pill', () => {
    renderContent({
      filteredIngredients: [videoIngredient],
      singularType: IngredientCategory.INGREDIENT,
      type: 'ingredients',
    });

    expect(
      screen.getByRole('img', { name: 'A red apple on a table' }),
    ).toHaveAttribute('src', 'https://cdn.genfeed.ai/mock/clip-poster.jpg');
    expect(screen.queryByAltText('Ingredient URL')).not.toBeInTheDocument();
    expect(
      screen.getByText('Video').closest('[class*="bg-primary/15"]'),
    ).not.toBeNull();
    expect(screen.queryByText('VIDEO')).not.toBeInTheDocument();
    expect(
      screen.getByText('Landscape').closest('[class*="bg-tertiary"]'),
    ).not.toBeNull();
  });

  it('falls back to a video placeholder when there is no poster', () => {
    renderContent({
      filteredIngredients: [
        {
          ...videoIngredient,
          thumbnailUrl: undefined,
        },
      ],
      singularType: IngredientCategory.INGREDIENT,
      type: 'ingredients',
    });

    expect(
      screen.getByTestId('ingredient-preview-fallback'),
    ).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('opens the ingredient modal for avatar rows in organization scope', () => {
    const { onOpenIngredientModal, onOpenLightbox } = renderContent();
    const row = screen.getByText('Avatar Source').closest('tr');

    expect(row).not.toBeNull();

    fireEvent.click(within(row as HTMLElement).getByTestId('action-button'));

    expect(onOpenIngredientModal).toHaveBeenCalledWith(
      ModalEnum.INGREDIENT,
      baseIngredient,
    );
    expect(onOpenLightbox).not.toHaveBeenCalled();
  });

  it('names the empty audio library instead of rendering a blank pane', () => {
    renderContent({
      filteredIngredients: [],
      singularType: IngredientCategory.MUSIC,
      type: 'ingredients',
    });

    expect(screen.getByText('No music yet')).toBeInTheDocument();
  });

  it('still lists audio ingredients when the library has some', () => {
    renderContent({
      filteredIngredients: [musicIngredient],
      singularType: IngredientCategory.MUSIC,
      type: 'ingredients',
    });

    expect(screen.getByText('Opening Theme')).toBeInTheDocument();
    expect(screen.queryByText('No music yet')).toBeNull();
  });
});

describe('IngredientsListContent inspector', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('docks the rail beside the grid on a wide viewport', () => {
    mockInspectorViewport(true);

    renderContent({ selectedIngredientIds: [baseIngredient.id] });

    expect(screen.getByLabelText('Asset details')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('presents the same rail as a sheet on a narrow viewport', () => {
    mockInspectorViewport(false);

    renderContent({ selectedIngredientIds: [baseIngredient.id] });

    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByLabelText('Asset details')).toBeInTheDocument();
    expect(within(dialog).getByText('Avatar Source')).toBeInTheDocument();
  });

  it('drops the selection when the sheet is dismissed', () => {
    mockInspectorViewport(false);

    const onSelectionChange = vi.fn();
    renderContent({
      onSelectionChange,
      selectedIngredientIds: [baseIngredient.id],
    });

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  it('shows no inspector for a multi-selection', () => {
    mockInspectorViewport(true);

    renderContent({ selectedIngredientIds: [baseIngredient.id, 'other-id'] });

    expect(screen.queryByLabelText('Asset details')).not.toBeInTheDocument();
  });
});
