import {
  IngredientCategory,
  IngredientStatus,
  ModalEnum,
  PageScope,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import IngredientsListContent from '@ui/ingredients/list/content/IngredientsListContent';
import { format } from 'date-fns';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { setSelectedAsset } = vi.hoisted(() => ({
  setSelectedAsset: vi.fn(),
}));

// The grid hands its single selection to the shared asset selection, and the
// library surface adapter renders the rail from there. Stubbing the context is
// what lets this test assert the handoff instead of the rail's markup.
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/contexts/ui/asset-selection.context', () => ({
  useAssetSelection: () => ({ setSelectedAsset }),
}));

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

// The canvas pulls React Flow in behind next/dynamic, whose loader never
// resolves under jsdom. Stubbing the boundary keeps this test on the view
// switch, which is what IngredientsListContent actually owns.
vi.mock('next/dynamic', () => ({
  default: () => {
    function LibraryCanvasStub({
      ingredients,
    }: {
      ingredients: IIngredient[];
    }) {
      return (
        <div data-testid="library-canvas">{(ingredients ?? []).length}</div>
      );
    }

    return LibraryCanvasStub;
  },
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

function renderContent(
  overrides: Partial<ComponentProps<typeof IngredientsListContent>> = {},
) {
  const onOpenIngredientModal = vi.fn();
  const onOpenLightbox = vi.fn(() => false);

  const { unmount } = render(
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

  return { onOpenIngredientModal, onOpenLightbox, unmount };
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

const voiceIngredient = {
  category: IngredientCategory.VOICE,
  createdAt: new Date().toISOString(),
  id: 'voice-1',
  ingredientUrl: 'https://cdn.genfeed.ai/mock/narration.mp3',
  metadataLabel: 'Narration Take',
  status: 'GENERATED',
  updatedAt: new Date().toISOString(),
} as unknown as IIngredient;

// A local, non-UTC-parsed Date so `format(createdAt, ...)` below and the
// component's own `format(new Date(ingredient.createdAt), ...)` always agree,
// regardless of the machine's timezone — both derive from the same instant.
const ledgerCreatedAt = new Date(2026, 0, 15, 9, 30);

const ledgerIngredient = {
  ...baseIngredient,
  createdAt: ledgerCreatedAt.toISOString(),
  id: 'ledger-1',
  metadataHeight: 1080,
  metadataWidth: 1920,
  modelUsed: 'Nano Banana Pro',
  provider: 'genfeedai',
} as unknown as IIngredient;

const failedIngredient = {
  ...baseIngredient,
  generationError: 'Provider rejected the prompt for a policy violation.',
  id: 'failed-1',
  status: IngredientStatus.FAILED,
} as unknown as IIngredient;

const staleErrorIngredient = {
  ...baseIngredient,
  generationError: 'Stale error from a prior failed attempt.',
  id: 'stale-error-1',
  status: IngredientStatus.GENERATED,
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

  it('arranges the same filtered set on the canvas view', () => {
    renderContent({
      filteredIngredients: [videoIngredient, musicIngredient],
      singularType: IngredientCategory.INGREDIENT,
      type: 'ingredients',
      viewMode: 'canvas',
    });

    expect(screen.getByTestId('library-canvas')).toHaveTextContent('2');
    expect(screen.queryByTestId('media-grid-item')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
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

  it('plays a music row from the Library list, regardless of page type', () => {
    // The unified Library list is `singularType: INGREDIENT` on every route —
    // audio rendering has to key off the row's own category, not the page.
    renderContent({
      filteredIngredients: [videoIngredient, musicIngredient],
      singularType: IngredientCategory.INGREDIENT,
      type: 'ingredients',
      viewMode: 'list',
    });

    expect(
      screen.getByRole('button', { name: 'Play preview for Opening Theme' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Play preview for A red apple on a table',
      }),
    ).not.toBeInTheDocument();
  });

  it('plays a music row inside the grid view’s mixed "other assets" table', () => {
    renderContent({
      filteredIngredients: [videoIngredient, musicIngredient],
      singularType: IngredientCategory.INGREDIENT,
      type: 'ingredients',
      viewMode: 'grid',
    });

    expect(screen.getByTestId('media-grid-item')).toHaveTextContent(
      'A red apple on a table',
    );
    expect(
      screen.getByRole('button', { name: 'Play preview for Opening Theme' }),
    ).toBeInTheDocument();
  });

  it('disables the music row control while the asset is still processing', () => {
    // A real PROCESSING row still carries `ingredientUrl` — the model falls
    // back to a placeholder image rather than an empty string — so readiness
    // has to come from status, not from whether a URL string is present.
    renderContent({
      filteredIngredients: [
        { ...musicIngredient, status: IngredientStatus.PROCESSING },
      ],
      singularType: IngredientCategory.MUSIC,
      type: 'ingredients',
      viewMode: 'list',
    });

    expect(
      screen.getByRole('button', { name: 'Play preview for Opening Theme' }),
    ).toBeDisabled();
  });

  it('disables the music row control for a FAILED asset', () => {
    renderContent({
      filteredIngredients: [
        { ...musicIngredient, status: IngredientStatus.FAILED },
      ],
      singularType: IngredientCategory.MUSIC,
      type: 'ingredients',
      viewMode: 'list',
    });

    expect(
      screen.getByRole('button', { name: 'Play preview for Opening Theme' }),
    ).toBeDisabled();
  });

  it('plays a voice row, not just music', () => {
    renderContent({
      filteredIngredients: [voiceIngredient],
      singularType: IngredientCategory.INGREDIENT,
      type: 'ingredients',
      viewMode: 'list',
    });

    expect(
      screen.getByRole('button', { name: 'Play preview for Narration Take' }),
    ).toBeEnabled();
  });
});

describe('IngredientsListContent audio playback', () => {
  class PreviewAudio extends EventTarget {
    src = '';
    preload = '';
    currentTime = 0;
    duration = 30;
    volume = 1;
    paused = true;
    ended = false;
    play = vi.fn(async () => {
      this.paused = false;
      this.dispatchEvent(new Event('playing'));
    });
    pause = vi.fn(() => {
      this.paused = true;
      this.dispatchEvent(new Event('pause'));
    });
  }

  let audio = new PreviewAudio();

  beforeEach(() => {
    vi.stubGlobal(
      'Audio',
      class extends PreviewAudio {
        constructor() {
          super();
          audio = this;
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays a single track at a time across rows', async () => {
    const secondMusic = {
      ...musicIngredient,
      id: 'music-2',
      ingredientUrl: 'https://cdn.genfeed.ai/mock/theme-2.mp3',
      metadataLabel: 'Closing Theme',
    } as unknown as IIngredient;

    renderContent({
      filteredIngredients: [musicIngredient, secondMusic],
      singularType: IngredientCategory.MUSIC,
      type: 'ingredients',
      viewMode: 'list',
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Play preview for Opening Theme' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Pause preview for Opening Theme' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Play preview for Closing Theme' }),
    ).toBeInTheDocument();

    // Starting the second track hands the one shared <audio> element to it,
    // so the first row falls back to "Play" without anyone pausing it by hand.
    fireEvent.click(
      screen.getByRole('button', { name: 'Play preview for Closing Theme' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Pause preview for Closing Theme' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Play preview for Opening Theme' }),
    ).toBeInTheDocument();
  });

  it('shows a playback error on one row without disturbing the rest of the list', async () => {
    renderContent({
      filteredIngredients: [videoIngredient, musicIngredient],
      singularType: IngredientCategory.INGREDIENT,
      type: 'ingredients',
      viewMode: 'list',
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Play preview for Opening Theme' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Pause preview for Opening Theme' }),
      ).toBeInTheDocument(),
    );

    act(() => audio.dispatchEvent(new Event('error')));

    expect(screen.getByText('Preview failed')).toBeInTheDocument();
    expect(screen.getByText('A red apple on a table')).toBeInTheDocument();
  });
});

describe('IngredientsListContent inspector handoff', () => {
  afterEach(() => {
    setSelectedAsset.mockClear();
  });

  it('publishes a single selection for the workspace rail', () => {
    renderContent({ selectedIngredientIds: [baseIngredient.id] });

    expect(setSelectedAsset).toHaveBeenCalledWith(baseIngredient);
  });

  it('publishes nothing for a multi-selection', () => {
    renderContent({ selectedIngredientIds: [baseIngredient.id, 'other-id'] });

    expect(setSelectedAsset).toHaveBeenCalledWith(null);
    expect(setSelectedAsset).not.toHaveBeenCalledWith(baseIngredient);
  });

  it('clears the published asset when the library unmounts', () => {
    const { unmount } = renderContent({
      selectedIngredientIds: [baseIngredient.id],
    });

    setSelectedAsset.mockClear();
    unmount();

    expect(setSelectedAsset).toHaveBeenCalledWith(null);
  });

  it('renders no inspector of its own', () => {
    renderContent({ selectedIngredientIds: [baseIngredient.id] });

    expect(screen.queryByLabelText('Asset details')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('IngredientsListContent generation ledger columns', () => {
  it('renders the seven ledger column headers in order', () => {
    renderContent({ viewMode: 'list' });

    const headers = screen
      .getAllByRole('columnheader')
      .map((header) => header.textContent);

    // The first header is the selectable checkbox column, owned by AppTable
    // itself — the ledger contract is the remaining columns, ending in the
    // unlabeled actions header.
    expect(headers.slice(1)).toEqual([
      '',
      'Asset',
      'Type',
      'Model',
      'Size',
      'Created',
      'Status',
      '',
    ]);
  });

  it("shows a normal asset's model, size, and created date", () => {
    renderContent({
      filteredIngredients: [ledgerIngredient],
      viewMode: 'list',
    });

    expect(screen.getByText('Nano Banana Pro')).toBeInTheDocument();
    expect(screen.getByText('genfeedai')).toBeInTheDocument();
    expect(screen.getByText('1920 × 1080')).toBeInTheDocument();
    expect(
      screen.getByText(format(ledgerCreatedAt, 'd MMM yyyy')),
    ).toBeInTheDocument();
  });

  it('surfaces the failure reason for a FAILED asset', () => {
    renderContent({
      filteredIngredients: [failedIngredient],
      viewMode: 'list',
    });

    expect(
      screen.getByTestId(`ingredient-failure-reason-${failedIngredient.id}`),
    ).toHaveTextContent('Provider rejected the prompt for a policy violation.');
  });

  it('does not surface a stale generationError on a non-failed asset', () => {
    renderContent({
      filteredIngredients: [staleErrorIngredient],
      viewMode: 'list',
    });

    expect(
      screen.queryByTestId(
        `ingredient-failure-reason-${staleErrorIngredient.id}`,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Stale error from a prior failed attempt.'),
    ).not.toBeInTheDocument();
  });

  it('renders an em dash when model and size are unavailable', () => {
    renderContent({ viewMode: 'list' });

    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('offers a retry action next to the status chip for a FAILED asset', () => {
    const onReprompt = vi.fn();
    renderContent({
      filteredIngredients: [failedIngredient],
      onReprompt,
      viewMode: 'list',
    });

    const retryButton = screen.getByRole('button', {
      name: 'Retry generation',
    });
    fireEvent.click(retryButton);

    expect(onReprompt).toHaveBeenCalledWith(failedIngredient);
  });

  it('does not offer a retry action for a non-failed asset', () => {
    renderContent({
      filteredIngredients: [ledgerIngredient],
      viewMode: 'list',
    });

    expect(
      screen.queryByRole('button', { name: 'Retry generation' }),
    ).not.toBeInTheDocument();
  });

  it('does not offer a retry action when onReprompt is not provided', () => {
    renderContent({
      filteredIngredients: [failedIngredient],
      onReprompt: undefined,
      viewMode: 'list',
    });

    expect(
      screen.queryByRole('button', { name: 'Retry generation' }),
    ).not.toBeInTheDocument();
  });
});
