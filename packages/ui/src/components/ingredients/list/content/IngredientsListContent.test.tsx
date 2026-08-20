import { IngredientCategory, ModalEnum, PageScope } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import IngredientsListContent from '@ui/ingredients/list/content/IngredientsListContent';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('IngredientsListContent', () => {
  it('renders avatar rows in the table view', () => {
    renderContent();

    expect(screen.getByText('Avatar Source')).toBeInTheDocument();
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
