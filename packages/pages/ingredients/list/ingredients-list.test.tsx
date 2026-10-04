import {
  FleetReviewStatus,
  IngredientCategory,
  TagBulkAction,
} from '@genfeedai/contracts';
import { LIBRARY_ASSET_TAGS_EVENT } from '@genfeedai/contracts/constants';
import type { ModalImageToVideoProps } from '@genfeedai/props/modals/modal.props';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockHeaderContext,
  mockOpenPostBatchModal,
  mockSetHeaderMeta,
  mockUseBrand,
  mockUseIngredientsList,
} = vi.hoisted(() => ({
  mockHeaderContext: vi.fn(),
  mockOpenPostBatchModal: vi.fn(),
  mockSetHeaderMeta: vi.fn(),
  mockUseBrand: vi.fn(),
  mockUseIngredientsList: vi.fn(),
}));

vi.mock('@contexts/content/ingredients-context/ingredients-context', () => ({
  useIngredientsContext: vi.fn(() => ({
    ingredientType: 'images',
    viewMode: 'grid',
  })),
}));

vi.mock(
  '@contexts/content/ingredients-header-context/ingredients-header-context',
  () => ({
    useIngredientsHeaderContext: () => mockHeaderContext(),
  }),
);

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: mockUseBrand,
}));

vi.mock(
  '@hooks/data/ingredients/use-ingredients-list/use-ingredients-list',
  () => ({
    useIngredientsList: mockUseIngredientsList,
  }),
);

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  usePostModal: vi.fn(() => ({
    openPostBatchModal: mockOpenPostBatchModal,
  })),
}));

vi.mock('@ui/ingredients/list/header/IngredientsListHeader', () => ({
  default: ({
    canPublishCampaign,
    onPublishCampaign,
    placement,
    tagAction,
  }: {
    canPublishCampaign: boolean;
    onPublishCampaign: () => void;
    placement?: string;
    tagAction?: React.ReactNode;
  }) => (
    <div data-placement={placement ?? 'overlay'} data-testid="selection-header">
      {tagAction}
      <span data-testid="publish-campaign-state">
        {canPublishCampaign ? 'enabled' : 'disabled'}
      </span>
      <button type="button" onClick={onPublishCampaign}>
        Publish Campaign
      </button>
    </div>
  ),
}));

vi.mock(
  '@ui/ingredients/list/selection-actions-bar/SelectionTagAction',
  () => ({
    default: ({
      selectedIngredients,
    }: {
      selectedIngredients: Array<{ id: string }>;
    }) => (
      <div data-testid="tag-action">
        {selectedIngredients.map((ingredient) => ingredient.id).join(',')}
      </div>
    ),
  }),
);

vi.mock('@ui/ingredients/list/content/IngredientsListContent', () => ({
  default: ({
    filteredIngredients,
    hasFilteredEmptyState,
    viewMode,
  }: {
    filteredIngredients: unknown[];
    hasFilteredEmptyState: boolean;
    viewMode?: string;
  }) => (
    <div
      data-filtered-empty={hasFilteredEmptyState}
      data-testid="ingredients-content"
      data-view-mode={viewMode}
    >
      {filteredIngredients.length} assets
    </div>
  ),
}));

vi.mock('@ui/ingredients/list/footer/IngredientsListFooter', () => ({
  default: () => <div data-testid="ingredients-footer" />,
}));

vi.mock('@ui/ingredients/list/sidebar/IngredientsListSidebar', () => ({
  default: () => <div data-testid="ingredients-sidebar" />,
}));

let capturedConversionModal: ModalImageToVideoProps | undefined;
vi.mock('@ui/lazy/modal/LazyModal', () => ({
  LazyModalImageToVideo: (props: ModalImageToVideoProps) => {
    capturedConversionModal = props;
    return null;
  },
}));

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ brandSlug: 'brand-1', orgSlug: 'org-1' })),
  usePathname: vi.fn(() => '/library/images'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams('')),
}));

function buildIngredientsListReturn(overrides: Record<string, unknown> = {}) {
  return {
    blacklists: [],
    brandId: 'brand-123',
    cachedAt: undefined,
    cameras: [],
    clearFilters: vi.fn(),
    closeLightbox: vi.fn(),
    filteredIngredients: [],
    folders: [],
    fontFamilies: [],
    formatFilter: 'all',
    handleArchiveIngredient: vi.fn(),
    handleBulkDelete: vi.fn(),
    handleClearSelection: vi.fn(),
    handleCloseImageToVideoModal: vi.fn(),
    handleConvertToPortrait: vi.fn(),
    handleConvertToVideo: undefined,
    handleCopyPrompt: vi.fn(),
    handleCreateFolder: vi.fn(),
    handleDeleteIngredient: vi.fn(),
    handleFolderDrop: vi.fn(),
    handleFolderModalConfirm: vi.fn(),
    handleGenerateCaptions: vi.fn(),
    handleImageToVideoPromptChange: vi.fn(),
    handleImageToVideoSubmit: vi.fn(),
    handleMerge: vi.fn(),
    handleMirror: vi.fn(),
    handleRefresh: vi.fn(),
    handleReprompt: vi.fn(),
    handleReverse: vi.fn(),
    handleScopeChange: vi.fn(),
    handleSeeDetails: vi.fn(),
    handleSelectFolder: vi.fn(),
    handleUpdateParent: vi.fn(),
    hasFilteredEmptyState: false,
    imageToVideoPromptData: undefined,
    imageToVideoTarget: undefined,
    isActionsEnabled: true,
    isDragEnabled: true,
    isGeneratingCaptions: false,
    isImageToVideoGenerating: false,
    isLoading: false,
    isLoadingFolders: false,
    isMerging: false,
    isMirroring: false,
    isPortraiting: false,
    isReversing: false,
    isUsingCache: false,
    loadError: null,
    lightboxIndex: 0,
    lightboxOpen: false,
    mediaIngredients: [],
    moods: [],
    openIngredientModal: vi.fn(),
    openLightboxForIngredient: vi.fn(),
    presets: [],
    selectedFolderForModal: undefined,
    selectedFolderId: undefined,
    selectedIngredientIds: [],
    setIngredients: vi.fn(),
    setSelectedIngredientIds: vi.fn(),
    singularType: IngredientCategory.IMAGE,
    sounds: [],
    styles: [],
    tags: [],
    type: 'images',
    videoModels: [],
    ...overrides,
  };
}

describe('IngredientsList', () => {
  beforeEach(() => {
    mockHeaderContext.mockReturnValue({
      setHeaderMeta: mockSetHeaderMeta,
    });
  });

  it('forwards the real scoped Crun conversion binding into the library modal', () => {
    const binding = {
      prepareRequest: () => null,
      submit: vi.fn().mockResolvedValue(undefined),
    };
    mockUseBrand.mockReturnValue({ selectedBrand: undefined });
    mockUseIngredientsList.mockReturnValue(
      buildIngredientsListReturn({
        handleConvertToVideo: vi.fn(),
        imageToVideoTarget: { id: 'source-owned' },
        imageToVideoCrunBinding: binding,
        imageToVideoPromptData: { text: 'Motion', isValid: true },
      }),
    );
    render(<IngredientsList type="images" />);
    expect(capturedConversionModal?.imageToVideoCrunBinding).toBe(binding);
    expect(capturedConversionModal?.image?.id).toBe('source-owned');
  });

  it('renders the canonical empty content state', () => {
    mockUseBrand.mockReturnValue({ selectedBrand: undefined });
    mockUseIngredientsList.mockReturnValue(buildIngredientsListReturn());

    render(<IngredientsList type="images" />);

    expect(screen.getByTestId('ingredients-content')).toHaveTextContent(
      '0 assets',
    );
    expect(screen.getByTestId('ingredients-content')).toHaveAttribute(
      'data-filtered-empty',
      'false',
    );
  });

  it('passes populated assets through the shared list content', () => {
    mockUseBrand.mockReturnValue({ selectedBrand: undefined });
    mockUseIngredientsList.mockReturnValue(
      buildIngredientsListReturn({
        filteredIngredients: [{ id: 'image-1' }],
      }),
    );

    render(<IngredientsList type="images" />);

    expect(screen.getByTestId('ingredients-content')).toHaveTextContent(
      '1 assets',
    );
  });

  it('moves folder navigation out of the asset grid for Library routes', () => {
    mockUseBrand.mockReturnValue({ selectedBrand: undefined });
    mockUseIngredientsList.mockReturnValue(buildIngredientsListReturn());

    render(<IngredientsList type="images" folderNavigation="shell" />);

    expect(screen.queryByTestId('ingredients-sidebar')).not.toBeInTheDocument();
    expect(screen.getByTestId('ingredients-content')).toBeInTheDocument();
    expect(screen.getByTestId('ingredients-content')).toHaveAttribute(
      'data-view-mode',
      'grid',
    );
  });

  it('renders a recoverable error state and retries the shared query', () => {
    const handleRefresh = vi.fn().mockResolvedValue(undefined);
    mockUseBrand.mockReturnValue({ selectedBrand: undefined });
    mockUseIngredientsList.mockReturnValue(
      buildIngredientsListReturn({
        handleRefresh,
        loadError: 'Failed to load images',
      }),
    );

    render(<IngredientsList type="images" />);

    expect(screen.getByText('Failed to load images')).toBeInTheDocument();
    expect(screen.queryByTestId('ingredients-content')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(handleRefresh).toHaveBeenCalledWith(true);
  });

  it('enables campaign publish for approved fleet images in one campaign', () => {
    const selectedIngredients = [
      {
        campaign: 'spring-drop',
        category: IngredientCategory.IMAGE,
        id: 'img-1',
        reviewStatus: FleetReviewStatus.APPROVED,
      },
      {
        campaign: 'spring-drop',
        category: IngredientCategory.IMAGE,
        id: 'img-2',
        reviewStatus: FleetReviewStatus.APPROVED,
      },
    ];

    mockUseBrand.mockReturnValue({
      selectedBrand: { isFleetEnabled: true },
    });
    mockUseIngredientsList.mockReturnValue(
      buildIngredientsListReturn({
        filteredIngredients: selectedIngredients,
        selectedIngredientIds: ['img-1', 'img-2'],
      }),
    );

    render(<IngredientsList type="images" />);

    expect(screen.getByTestId('publish-campaign-state')).toHaveTextContent(
      'enabled',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish Campaign' }));

    expect(mockOpenPostBatchModal).toHaveBeenCalledWith(selectedIngredients);
  });

  it('keeps selection actions out of the pinned bar until something is selected', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    mockHeaderContext.mockReturnValue({
      hostsSelectionActions: true,
      selectionSlot: slot,
      setHeaderMeta: mockSetHeaderMeta,
    });
    mockUseBrand.mockReturnValue({ selectedBrand: undefined });
    mockUseIngredientsList.mockReturnValue(buildIngredientsListReturn());

    render(<IngredientsList type="images" />);

    expect(screen.queryByTestId('selection-header')).not.toBeInTheDocument();
    expect(slot).toBeEmptyDOMElement();
    slot.remove();
  });

  it('puts selection actions in the pinned library bar', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    mockHeaderContext.mockReturnValue({
      hostsSelectionActions: true,
      selectionSlot: slot,
      setHeaderMeta: mockSetHeaderMeta,
    });
    mockUseBrand.mockReturnValue({ selectedBrand: undefined });
    mockUseIngredientsList.mockReturnValue(
      buildIngredientsListReturn({
        filteredIngredients: [{ id: 'img-1' }],
        selectedIngredientIds: ['img-1'],
      }),
    );

    render(<IngredientsList type="images" />);

    const header = screen.getByTestId('selection-header');
    expect(header).toHaveAttribute('data-placement', 'subtopbar');
    expect(slot).toContainElement(header);
    slot.remove();
  });

  it('disables campaign publish when assets are from different campaigns', () => {
    mockUseBrand.mockReturnValue({
      selectedBrand: { isFleetEnabled: true },
    });
    mockUseIngredientsList.mockReturnValue(
      buildIngredientsListReturn({
        filteredIngredients: [
          {
            campaign: 'spring-drop',
            category: IngredientCategory.IMAGE,
            id: 'img-1',
            reviewStatus: FleetReviewStatus.APPROVED,
          },
          {
            campaign: 'summer-drop',
            category: IngredientCategory.IMAGE,
            id: 'img-2',
            reviewStatus: FleetReviewStatus.APPROVED,
          },
        ],
        selectedIngredientIds: ['img-1', 'img-2'],
      }),
    );

    render(<IngredientsList type="images" />);

    expect(screen.getByTestId('publish-campaign-state')).toHaveTextContent(
      'disabled',
    );
  });

  it('hands the selected assets to the bulk tag action', () => {
    mockUseBrand.mockReturnValue({ selectedBrand: undefined });
    mockUseIngredientsList.mockReturnValue(
      buildIngredientsListReturn({
        filteredIngredients: [
          { id: 'img-1' },
          { id: 'img-2' },
          { id: 'img-3' },
        ],
        selectedIngredientIds: ['img-1', 'img-3'],
      }),
    );

    render(<IngredientsList type="images" />);

    expect(screen.getByTestId('tag-action')).toHaveTextContent('img-1,img-3');
  });

  describe('tag changes published by the inspector and the bulk bar', () => {
    const tag = { backgroundColor: '#000', id: 'tag-1', label: 'S1E12' };

    function renderWithSetIngredients() {
      const setIngredients = vi.fn();
      mockUseBrand.mockReturnValue({ selectedBrand: undefined });
      mockUseIngredientsList.mockReturnValue(
        buildIngredientsListReturn({ setIngredients }),
      );
      const view = render(<IngredientsList type="images" />);
      return { setIngredients, view };
    }

    function publish(detail: unknown) {
      act(() => {
        window.dispatchEvent(
          new CustomEvent(LIBRARY_ASSET_TAGS_EVENT, { detail }),
        );
      });
    }

    it('applies the change to the rows it already holds', () => {
      const { setIngredients } = renderWithSetIngredients();

      publish({
        action: TagBulkAction.ADD,
        ingredientIds: ['img-1'],
        tag,
      });

      expect(setIngredients).toHaveBeenCalledTimes(1);
      const update = setIngredients.mock.calls[0][0] as (
        current: Array<{ id: string; tags?: unknown[] }>,
      ) => Array<{ id: string; tags?: unknown[] }>;
      const next = update([{ id: 'img-1' }, { id: 'img-2' }]);
      expect(next[0]?.tags).toEqual([tag]);
      expect(next[1]).toEqual({ id: 'img-2' });
    });

    it('ignores an event with no detail', () => {
      const { setIngredients } = renderWithSetIngredients();

      publish(undefined);

      expect(setIngredients).not.toHaveBeenCalled();
    });

    it('stops listening when the list unmounts', () => {
      const { setIngredients, view } = renderWithSetIngredients();

      view.unmount();
      publish({ action: TagBulkAction.ADD, ingredientIds: ['img-1'], tag });

      expect(setIngredients).not.toHaveBeenCalled();
    });
  });
});
