import {
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
} from '@genfeedai/enums';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function createAction(id: string, label: string, showInMenu = true) {
  return {
    id,
    label,
    onClick: vi.fn(),
    showInMenu,
  };
}

vi.mock('@ui/quick-actions/config/quick-actions.config', () => ({
  createCaptionsAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('captions', 'Add Captions') : null,
  ),
  createCloneAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('clone', 'Clone') : null,
  ),
  createConvertToPresetAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('convert-to-preset', 'Convert to Preset') : null,
  ),
  createDeleteAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('delete', 'Delete') : null,
  ),
  createDownloadAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('download', 'Download') : null,
  ),
  createEditAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('edit', 'Edit') : null,
  ),
  createFavoriteAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('favorite', 'Favorite') : null,
  ),
  createGifAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('gif', 'Transform to GIF') : null,
  ),
  createLandscapeAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('landscape', 'Landscape') : null,
  ),
  createMirrorAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('mirror', 'Mirror') : null,
  ),
  createMoreOptionsAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('more-options', 'More', false) : null,
  ),
  createPortraitAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('portrait', 'Portrait') : null,
  ),
  createPromptAction: vi.fn((ingredient, handler) =>
    handler && ingredient.promptText ? createAction('prompt', 'Prompt') : null,
  ),
  createPublishAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('publish', 'Publish') : null,
  ),
  createReverseAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('reverse', 'Reverse') : null,
  ),
  createSeeDetailsAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('see-details', 'Open') : null,
  ),
  createSetAsBannerAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('set-as-banner', 'Set as Banner') : null,
  ),
  createSetAsLogoAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('set-as-logo', 'Set as Logo') : null,
  ),
  createShareAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('share', 'Share') : null,
  ),
  createSquareAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('square', 'Square') : null,
  ),
  createTagsAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('manage-tags', 'Tags') : null,
  ),
  createTextOverlayAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('text-overlay', 'Add Text Overlay') : null,
  ),
  createTrimAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('trim', 'Trim') : null,
  ),
  createUpscaleAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('upscale', 'Upscale') : null,
  ),
  createUseAsVideoReferenceAction: vi.fn((_ingredient, handler) =>
    handler
      ? createAction('use-as-video-reference', 'Set as Video Reference')
      : null,
  ),
  createUsePromptAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('use-prompt', 'Use Prompt') : null,
  ),
  createVariationAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('create-variation', 'Create Variation') : null,
  ),
  createVideoAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('convert-to-video', 'Convert to Video') : null,
  ),
  createVoteAction: vi.fn((_ingredient, handler) =>
    handler ? createAction('vote', 'Vote') : null,
  ),
}));

import { useQuickActions } from '@hooks/ui/use-quick-actions/use-quick-actions';

const mockHandlers = {
  onAddTextOverlay: vi.fn(),
  onClone: vi.fn(),
  onConvertToGif: vi.fn(),
  onConvertToPreset: vi.fn(),
  onConvertToVideo: vi.fn(),
  onCreateVariation: vi.fn(),
  onDelete: vi.fn(),
  onDownload: vi.fn(),
  onEdit: vi.fn(),
  onGenerateCaptions: vi.fn(),
  onLandscape: vi.fn(),
  onManageTags: vi.fn(),
  onMirror: vi.fn(),
  onMoreOptions: vi.fn(),
  onPortrait: vi.fn(),
  onPublish: vi.fn(),
  onReverse: vi.fn(),
  onSeeDetails: vi.fn(),
  onSetAsBanner: vi.fn(),
  onSetAsLogo: vi.fn(),
  onShare: vi.fn(),
  onShowPrompt: vi.fn(),
  onSquare: vi.fn(),
  onToggleFavorite: vi.fn(),
  onTrim: vi.fn(),
  onUpscale: vi.fn(),
  onUseAsVideoReference: vi.fn(),
  onUsePrompt: vi.fn(),
  onVote: vi.fn(),
};

const mockLoadingStates = {
  isAddingTextOverlay: false,
  isCloning: false,
  isConverting: false,
  isConvertingToVideo: false,
  isDeleting: false,
  isDownloading: false,
  isGeneratingCaptions: false,
  isLandscaping: false,
  isMarkingArchived: false,
  isMarkingRejected: false,
  isMarkingValidated: false,
  isMirroring: false,
  isPortraiting: false,
  isPublishing: false,
  isReversing: false,
  isSettingAsBanner: false,
  isSettingAsLogo: false,
  isSquaring: false,
  isTogglingFavorite: false,
  isTrimming: false,
  isUpscaling: false,
  isUsingPrompt: false,
  isVoting: false,
};

function createMockIngredient(overrides = {}) {
  return {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
    ingredientFormat: IngredientFormat.PORTRAIT,
    promptText: 'test prompt',
    status: IngredientStatus.GENERATED,
    ...overrides,
  };
}

describe('useQuickActions', () => {
  it('returns empty groups when no ingredient is selected', () => {
    const { result } = renderHook(() =>
      useQuickActions({
        handlers: mockHandlers,
        isVideo: false,
        loadingStates: mockLoadingStates,
        selectedIngredient: null,
      }),
    );

    expect(result.current.actions).toEqual([]);
    expect(result.current.contextActions).toEqual([]);
    expect(result.current.primaryActions).toEqual([]);
    expect(result.current.menuActions).toEqual([]);
  });

  it('chooses image-first primary actions when available', () => {
    const { result } = renderHook(() =>
      useQuickActions({
        handlers: mockHandlers,
        isVideo: false,
        loadingStates: mockLoadingStates,
        selectedIngredient: createMockIngredient() as any,
      }),
    );

    expect(result.current.primaryActions.map((action) => action.id)).toEqual([
      'see-details',
      'create-variation',
      'convert-to-video',
    ]);
  });

  it('chooses video-first primary actions when available', () => {
    const { result } = renderHook(() =>
      useQuickActions({
        handlers: mockHandlers,
        isVideo: true,
        loadingStates: mockLoadingStates,
        selectedIngredient: createMockIngredient({
          category: IngredientCategory.VIDEO,
        }) as any,
      }),
    );

    expect(result.current.primaryActions.map((action) => action.id)).toEqual([
      'see-details',
      'trim',
      'captions',
    ]);
  });

  it('uses processing-safe primary actions', () => {
    const { result } = renderHook(() =>
      useQuickActions({
        handlers: mockHandlers,
        isVideo: false,
        loadingStates: mockLoadingStates,
        selectedIngredient: createMockIngredient({
          status: IngredientStatus.PROCESSING,
        }) as any,
      }),
    );

    expect(result.current.primaryActions.map((action) => action.id)).toEqual([
      'see-details',
      'download',
      'publish',
    ]);
    expect(result.current.primaryActions[1]?.isDisabled).toBe(true);
    expect(result.current.primaryActions[2]?.isDisabled).toBe(true);
  });

  it('does not duplicate primary actions inside the menu', () => {
    const { result } = renderHook(() =>
      useQuickActions({
        handlers: mockHandlers,
        isVideo: false,
        loadingStates: mockLoadingStates,
        selectedIngredient: createMockIngredient() as any,
      }),
    );

    const primaryIds = new Set(
      result.current.primaryActions.map((action) => action.id),
    );

    result.current.menuActions.forEach((action) => {
      expect(primaryIds.has(action.id)).toBe(false);
    });
  });

  it('groups menu actions into ordered sections', () => {
    const { result } = renderHook(() =>
      useQuickActions({
        handlers: mockHandlers,
        isVideo: false,
        loadingStates: mockLoadingStates,
        selectedIngredient: createMockIngredient() as any,
      }),
    );

    expect(result.current.menuActions[0]?.sectionLabel).toBe('Transform');
    expect(
      result.current.menuActions.some(
        (action) =>
          action.sectionLabel === 'Branding' && action.id === 'set-as-logo',
      ),
    ).toBe(true);
    expect(
      result.current.menuActions.some(
        (action) => action.sectionLabel === 'Library',
      ),
    ).toBe(true);
    expect(
      result.current.menuActions.some(
        (action) => action.sectionLabel === 'Danger' && action.id === 'delete',
      ),
    ).toBe(true);
  });

  it('exposes context controls separately from quick actions', () => {
    const { result } = renderHook(() =>
      useQuickActions({
        handlers: mockHandlers,
        hasPromptControl: true,
        hasScopeControl: true,
        hasStatusControl: true,
        isVideo: false,
        loadingStates: mockLoadingStates,
        selectedIngredient: createMockIngredient() as any,
      }),
    );

    expect(result.current.contextActions.map((action) => action.id)).toEqual([
      'prompt',
      'status',
      'scope',
    ]);
  });

  it('removes prompt from the menu when the prompt context control is visible', () => {
    const { result } = renderHook(() =>
      useQuickActions({
        handlers: mockHandlers,
        hasPromptControl: true,
        isVideo: false,
        loadingStates: mockLoadingStates,
        selectedIngredient: createMockIngredient() as any,
      }),
    );

    expect(
      result.current.menuActions.some((action) => action.id === 'prompt'),
    ).toBe(false);
  });

  it('keeps prompt available in the menu when compact mode hides context controls', () => {
    const { result } = renderHook(() =>
      useQuickActions({
        handlers: mockHandlers,
        hasPromptControl: false,
        isVideo: false,
        loadingStates: mockLoadingStates,
        selectedIngredient: createMockIngredient() as any,
      }),
    );

    expect(
      result.current.menuActions.some((action) => action.id === 'prompt'),
    ).toBe(true);
  });

  it('preserves mainActions as a compatibility alias of primaryActions', () => {
    const { result } = renderHook(() =>
      useQuickActions({
        handlers: mockHandlers,
        isVideo: false,
        loadingStates: mockLoadingStates,
        selectedIngredient: createMockIngredient() as any,
      }),
    );

    expect(result.current.mainActions).toEqual(result.current.primaryActions);
  });
});
