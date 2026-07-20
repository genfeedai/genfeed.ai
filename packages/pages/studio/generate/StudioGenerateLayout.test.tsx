import {
  IngredientCategory,
  IngredientFormat,
  ViewType,
} from '@genfeedai/enums';
import StudioGenerateLayout from '@pages/studio/generate/StudioGenerateLayout';
import { useStudioGenerateLayout } from '@pages/studio/generate/useStudioGenerateLayout';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pages/studio/generate/useStudioGenerateLayout', () => ({
  useStudioGenerateLayout: vi.fn(),
}));

vi.mock('@pages/studio/generate/components', () => ({
  AssetControlsHeader: () => <div data-testid="asset-controls-header" />,
  GenerateContentArea: ({
    emptyComposer,
    isEmptyStudioState,
  }: {
    emptyComposer?: ReactNode;
    isEmptyStudioState: boolean;
  }) => (
    <div data-empty={String(isEmptyStudioState)} data-testid="content-area">
      {emptyComposer}
    </div>
  ),
  StudioComposer: ({ isEmptyState }: { isEmptyState: boolean }) => (
    <div data-empty={String(isEmptyState)} data-testid="studio-composer" />
  ),
}));

vi.mock('@ui/layouts/lightbox/MediaLightbox', () => ({
  default: () => <div data-testid="media-lightbox" />,
}));

const useStudioGenerateLayoutMock = vi.mocked(useStudioGenerateLayout);
type StudioGenerateLayoutState = ReturnType<typeof useStudioGenerateLayout>;

function createLayoutState(
  overrides: Partial<StudioGenerateLayoutState> = {},
): StudioGenerateLayoutState {
  return {
    actions: [],
    allAssets: [],
    avatarOptions: [],
    avatarPreviewUrl: undefined,
    blacklists: [],
    cameraMovementPreset: 'static',
    cameras: [],
    categoryType: IngredientCategory.IMAGE,
    clearStoryboard: vi.fn(),
    columns: [],
    currentModels: [],
    customCameraPrompt: '',
    emptyLabel: 'No assets yet',
    filteredPresets: [],
    filters: {},
    findAllAssets: vi.fn(async () => {}),
    folders: [],
    fontFamilies: [],
    generateLabel: 'Generate',
    handleBulkDelete: vi.fn(),
    handleBulkStatusChange: vi.fn(),
    handleCategoryTypeChange: vi.fn(),
    handleClearSelection: vi.fn(),
    handleConvertImageToVideo: vi.fn(),
    handleCopy: vi.fn(),
    handleCreateVariation: vi.fn(),
    handleEditIngredient: vi.fn(),
    handleFiltersChange: vi.fn(),
    handleGenerateStoryboard: vi.fn(),
    handleIngredientClick: vi.fn(),
    handleLoadMore: vi.fn(async () => {}),
    handleMarkArchived: vi.fn(async () => {}),
    handleMarkRejected: vi.fn(async () => {}),
    handleMarkValidated: vi.fn(async () => {}),
    handlePromptConfigChange: vi.fn(),
    handlePublishIngredient: vi.fn(),
    handleRefresh: vi.fn(),
    handleReprompt: vi.fn(async () => {}),
    handleSeeDetails: vi.fn(),
    handleSubmit: vi.fn(),
    handleToggleFavorite: vi.fn(async () => {}),
    handleViewModeChange: vi.fn(),
    hasInterpolationModel: false,
    hasMore: false,
    initialLoadComplete: true,
    isAvatarCategory: false,
    isAvailabilityLoading: false,
    isBulkUpdating: false,
    isEmptyStudioState: true,
    isGenerationCooldown: false,
    isImageCategory: true,
    isImageOrVideo: true,
    isLoading: false,
    isLoadingMore: false,
    isMusicCategory: false,
    isRefreshing: false,
    isStoryboardGenerating: false,
    isVideoCategory: false,
    lightboxIndex: 0,
    lightboxOpen: false,
    moods: [],
    promptConfig: { isValid: true },
    promptText: '',
    resolvedGridFormat: IngredientFormat.SQUARE,
    scenes: [],
    scrollFocusedAssetId: null,
    selectedIngredientIds: [],
    setCameraMovementPreset: vi.fn(),
    setCustomCameraPrompt: vi.fn(),
    setLightboxOpen: vi.fn(),
    setPromptText: vi.fn(),
    setStoryboardFrames: vi.fn(),
    setTableSelectedIds: vi.fn(),
    sounds: [],
    storyboardFormat: IngredientFormat.SQUARE,
    storyboardFrames: [],
    styles: [],
    supportsMasonry: true,
    tableSelectedIds: [],
    tags: [],
    trainings: [],
    viewMode: ViewType.MASONRY,
    voiceOptions: [],
    ...overrides,
  } as StudioGenerateLayoutState;
}

describe('StudioGenerateLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStudioGenerateLayoutMock.mockReturnValue(createLayoutState());
  });

  it('places the composer inside the empty content area before assets exist', () => {
    render(<StudioGenerateLayout />);

    expect(screen.getByTestId('content-area')).toHaveAttribute(
      'data-empty',
      'true',
    );
    expect(screen.getAllByTestId('studio-composer')).toHaveLength(1);
    expect(screen.getByTestId('content-area')).toContainElement(
      screen.getByTestId('studio-composer'),
    );
    expect(screen.getByTestId('studio-composer')).toHaveAttribute(
      'data-empty',
      'true',
    );
  });

  it('docks the composer outside the content area once assets exist', () => {
    useStudioGenerateLayoutMock.mockReturnValue(
      createLayoutState({
        isEmptyStudioState: false,
      }),
    );

    render(<StudioGenerateLayout />);

    expect(screen.getByTestId('content-area')).toHaveAttribute(
      'data-empty',
      'false',
    );
    expect(screen.getAllByTestId('studio-composer')).toHaveLength(1);
    expect(screen.getByTestId('content-area')).not.toContainElement(
      screen.getByTestId('studio-composer'),
    );
    expect(screen.getByTestId('studio-composer')).toHaveAttribute(
      'data-empty',
      'false',
    );
  });
});
