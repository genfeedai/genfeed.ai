import { IngredientCategory } from '@genfeedai/enums';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const {
  mockOpenPostBatchModal,
  mockSetHeaderMeta,
  mockUseBrand,
  mockUseIngredientsList,
} = vi.hoisted(() => ({
  mockOpenPostBatchModal: vi.fn(),
  mockSetHeaderMeta: vi.fn(),
  mockUseBrand: vi.fn(),
  mockUseIngredientsList: vi.fn(),
}));

vi.mock('@contexts/content/ingredients-context/ingredients-context', () => ({
  useIngredientsContext: vi.fn(() => ({
    ingredientType: 'images',
  })),
}));

vi.mock(
  '@contexts/content/ingredients-header-context/ingredients-header-context',
  () => ({
    useIngredientsHeaderContext: vi.fn(() => ({
      setHeaderMeta: mockSetHeaderMeta,
    })),
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
  }: {
    canPublishCampaign: boolean;
    onPublishCampaign: () => void;
  }) => (
    <div>
      <span data-testid="publish-campaign-state">
        {canPublishCampaign ? 'enabled' : 'disabled'}
      </span>
      <button type="button" onClick={onPublishCampaign}>
        Publish Campaign
      </button>
    </div>
  ),
}));

vi.mock('@ui/ingredients/list/content/IngredientsListContent', () => ({
  default: () => <div data-testid="ingredients-content" />,
}));

vi.mock('@ui/ingredients/list/footer/IngredientsListFooter', () => ({
  default: () => <div data-testid="ingredients-footer" />,
}));

vi.mock('@ui/ingredients/list/sidebar/IngredientsListSidebar', () => ({
  default: () => <div data-testid="ingredients-sidebar" />,
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
  LazyModalImageToVideo: () => null,
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
  it('enables campaign publish for approved darkroom images in one campaign', () => {
    const selectedIngredients = [
      {
        campaign: 'spring-drop',
        category: IngredientCategory.IMAGE,
        id: 'img-1',
        reviewStatus: 'approved',
      },
      {
        campaign: 'spring-drop',
        category: IngredientCategory.IMAGE,
        id: 'img-2',
        reviewStatus: 'approved',
      },
    ];

    mockUseBrand.mockReturnValue({
      selectedBrand: { isDarkroomEnabled: true },
    });
    mockUseIngredientsList.mockReturnValue(
      buildIngredientsListReturn({
        filteredIngredients: selectedIngredients,
        selectedIngredientIds: ['img-1', 'img-2'],
      }),
    );

    render(<IngredientsList />);

    expect(screen.getByTestId('publish-campaign-state')).toHaveTextContent(
      'enabled',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish Campaign' }));

    expect(mockOpenPostBatchModal).toHaveBeenCalledWith(selectedIngredients);
  });

  it('disables campaign publish when assets are from different campaigns', () => {
    mockUseBrand.mockReturnValue({
      selectedBrand: { isDarkroomEnabled: true },
    });
    mockUseIngredientsList.mockReturnValue(
      buildIngredientsListReturn({
        filteredIngredients: [
          {
            campaign: 'spring-drop',
            category: IngredientCategory.IMAGE,
            id: 'img-1',
            reviewStatus: 'approved',
          },
          {
            campaign: 'summer-drop',
            category: IngredientCategory.IMAGE,
            id: 'img-2',
            reviewStatus: 'approved',
          },
        ],
        selectedIngredientIds: ['img-1', 'img-2'],
      }),
    );

    render(<IngredientsList />);

    expect(screen.getByTestId('publish-campaign-state')).toHaveTextContent(
      'disabled',
    );
  });
});
