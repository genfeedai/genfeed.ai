import type { IIngredient } from '@genfeedai/interfaces';
import type {
  IActionHandlers,
  ILoadingStates,
  IQuickAction,
} from '@genfeedai/interfaces/ui/quick-actions.interface';
import {
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
} from '@genfeedai/enums';
import {
  createCaptionsAction,
  createCloneAction,
  createConvertToPresetAction,
  createDeleteAction,
  createDownloadAction,
  createEditAction,
  createFavoriteAction,
  createGifAction,
  createLandscapeAction,
  createMirrorAction,
  createMoreOptionsAction,
  createPortraitAction,
  createPromptAction,
  createPublishAction,
  createReverseAction,
  createSeeDetailsAction,
  createSetAsBannerAction,
  createSetAsLogoAction,
  createShareAction,
  createSquareAction,
  createTagsAction,
  createTextOverlayAction,
  createTrimAction,
  createUpscaleAction,
  createUseAsVideoReferenceAction,
  createUsePromptAction,
  createVariationAction,
  createVideoAction,
  createVoteAction,
} from '@ui/quick-actions/config/quick-actions.config';
import { useMemo } from 'react';

type ContextActionId = 'prompt' | 'scope' | 'status';
type MenuSection = 'Branding' | 'Danger' | 'Library' | 'Transform';

export interface UseQuickActionsParams {
  selectedIngredient?: IIngredient | null;
  handlers: IActionHandlers;
  loadingStates: ILoadingStates;
  isVideo: boolean;
  hasPromptControl?: boolean;
  hasScopeControl?: boolean;
  hasStatusControl?: boolean;
}

const MENU_SECTION_ORDER: MenuSection[] = [
  'Transform',
  'Branding',
  'Library',
  'Danger',
];

const ACTION_SECTION_BY_ID: Partial<Record<string, MenuSection>> = {
  captions: 'Transform',
  clone: 'Transform',
  'convert-to-preset': 'Transform',
  'convert-to-video': 'Transform',
  'create-variation': 'Transform',
  delete: 'Danger',
  download: 'Library',
  edit: 'Library',
  favorite: 'Library',
  gif: 'Transform',
  landscape: 'Transform',
  'manage-tags': 'Library',
  mirror: 'Transform',
  portrait: 'Transform',
  prompt: 'Library',
  publish: 'Library',
  reverse: 'Transform',
  'set-as-banner': 'Branding',
  'set-as-logo': 'Branding',
  share: 'Library',
  square: 'Transform',
  'text-overlay': 'Transform',
  trim: 'Transform',
  upscale: 'Transform',
  'use-as-video-reference': 'Library',
  'use-prompt': 'Library',
  vote: 'Library',
};

function compactActions(
  actions: Array<IQuickAction | null | undefined>,
): IQuickAction[] {
  return actions.filter((action): action is IQuickAction => action !== null);
}

function buildActionMap(actions: IQuickAction[]): Map<string, IQuickAction> {
  return new Map(actions.map((action) => [action.id, action]));
}

function getActionById(
  actionMap: Map<string, IQuickAction>,
  actionId: string,
): IQuickAction | null {
  return actionMap.get(actionId) ?? null;
}

function selectPrimaryActions(
  actionMap: Map<string, IQuickAction>,
  preferredIds: string[],
  fallbackId: string | null,
  backupIds: string[],
): IQuickAction[] {
  const selectedActions: IQuickAction[] = [];
  const selectedActionIds = new Set<string>();

  const tryAddAction = (actionId: string | null | undefined): boolean => {
    if (!actionId) {
      return false;
    }

    const action = actionMap.get(actionId);
    if (!action || selectedActionIds.has(action.id)) {
      return false;
    }

    selectedActions.push(action);
    selectedActionIds.add(action.id);
    return true;
  };

  for (const preferredId of preferredIds) {
    if (!tryAddAction(preferredId)) {
      tryAddAction(fallbackId);
    }

    if (selectedActions.length >= 3) {
      return selectedActions.slice(0, 3);
    }
  }

  for (const backupId of backupIds) {
    tryAddAction(backupId);

    if (selectedActions.length >= 3) {
      return selectedActions.slice(0, 3);
    }
  }

  return selectedActions;
}

function applyMenuSections(actions: IQuickAction[]): IQuickAction[] {
  const groupedActions = new Map<MenuSection, IQuickAction[]>(
    MENU_SECTION_ORDER.map((section) => [section, []]),
  );
  const ungroupedActions: IQuickAction[] = [];

  actions.forEach((action) => {
    const section = ACTION_SECTION_BY_ID[action.id];

    if (section) {
      groupedActions.get(section)?.push(action);
      return;
    }

    ungroupedActions.push(action);
  });

  const orderedMenuActions: IQuickAction[] = [];
  let hasRenderedSection = false;

  for (const section of MENU_SECTION_ORDER) {
    const sectionActions = groupedActions.get(section) ?? [];

    sectionActions.forEach((action, index) => {
      orderedMenuActions.push({
        ...action,
        dividerBefore: hasRenderedSection && index === 0,
        sectionLabel: index === 0 ? section : undefined,
      });
    });

    if (sectionActions.length > 0) {
      hasRenderedSection = true;
    }
  }

  return [...orderedMenuActions, ...ungroupedActions];
}

export function useQuickActions({
  selectedIngredient,
  handlers,
  loadingStates,
  isVideo,
  hasPromptControl = false,
  hasScopeControl = false,
  hasStatusControl = false,
}: UseQuickActionsParams) {
  const contextActions = useMemo(() => {
    if (!selectedIngredient) {
      return [];
    }

    const nextContextActions: Array<{ id: ContextActionId }> = [];

    if (hasPromptControl) {
      nextContextActions.push({ id: 'prompt' });
    }

    if (hasStatusControl) {
      nextContextActions.push({ id: 'status' });
    }

    if (hasScopeControl) {
      nextContextActions.push({ id: 'scope' });
    }

    return nextContextActions;
  }, [hasPromptControl, hasScopeControl, hasStatusControl, selectedIngredient]);

  const generatedActions = useMemo(() => {
    if (!selectedIngredient) {
      return [];
    }

    const isGif = selectedIngredient.category === IngredientCategory.GIF;

    const actionsList: Array<IQuickAction | null> = [
      createPromptAction(selectedIngredient, handlers.onShowPrompt),
      createUsePromptAction(
        selectedIngredient,
        handlers.onUsePrompt,
        loadingStates.isUsingPrompt,
      ),
      createShareAction(
        selectedIngredient,
        handlers.onShare,
        loadingStates.isDownloading,
      ),
      createVoteAction(
        selectedIngredient,
        handlers.onVote,
        loadingStates.isVoting,
      ),
      createFavoriteAction(
        selectedIngredient,
        handlers.onToggleFavorite,
        loadingStates.isTogglingFavorite,
      ),
      createEditAction(
        selectedIngredient,
        handlers.onEdit,
        loadingStates.isDownloading,
      ),
      createMoreOptionsAction(
        selectedIngredient,
        handlers.onMoreOptions,
        loadingStates.isDownloading,
      ),
    ];

    if (isVideo) {
      actionsList.push(
        createCaptionsAction(
          selectedIngredient,
          handlers.onGenerateCaptions,
          loadingStates.isGeneratingCaptions,
        ),
        createTextOverlayAction(
          selectedIngredient,
          handlers.onAddTextOverlay,
          loadingStates.isAddingTextOverlay,
        ),
        createTrimAction(
          selectedIngredient,
          handlers.onTrim,
          loadingStates.isTrimming,
        ),
        createGifAction(
          selectedIngredient,
          handlers.onConvertToGif,
          loadingStates.isConverting,
        ),
      );
    } else {
      actionsList.push(
        createVideoAction(
          selectedIngredient,
          handlers.onConvertToVideo,
          loadingStates.isConvertingToVideo,
        ),
        createVariationAction(selectedIngredient, handlers.onCreateVariation),
        createUseAsVideoReferenceAction(
          selectedIngredient,
          handlers.onUseAsVideoReference,
        ),
        // Hide "Set as Logo" and "Set as Banner" for GIFs
        !isGif
          ? createSetAsLogoAction(
              selectedIngredient,
              handlers.onSetAsLogo,
              loadingStates.isSettingAsLogo,
            )
          : null,
        !isGif
          ? createSetAsBannerAction(
              selectedIngredient,
              handlers.onSetAsBanner,
              loadingStates.isSettingAsBanner,
            )
          : null,
      );
    }

    // Add format conversion actions based on current format
    if (selectedIngredient.ingredientFormat !== IngredientFormat.PORTRAIT) {
      actionsList.push(
        createPortraitAction(
          selectedIngredient,
          handlers.onPortrait,
          loadingStates.isPortraiting,
        ),
      );
    }

    if (selectedIngredient.ingredientFormat !== IngredientFormat.SQUARE) {
      actionsList.push(
        createSquareAction(
          selectedIngredient,
          handlers.onSquare,
          loadingStates.isSquaring,
        ),
      );
    }

    if (selectedIngredient.ingredientFormat !== IngredientFormat.LANDSCAPE) {
      actionsList.push(
        createLandscapeAction(
          selectedIngredient,
          handlers.onLandscape,
          loadingStates.isLandscaping,
        ),
      );
    }

    actionsList.push(
      createTagsAction(selectedIngredient, handlers.onManageTags),
      // Hide "Upscale" for GIFs
      !isGif
        ? createUpscaleAction(
            selectedIngredient,
            handlers.onUpscale,
            loadingStates.isUpscaling,
          )
        : null,
      // Hide "Clone" for GIFs
      !isGif
        ? createCloneAction(
            selectedIngredient,
            handlers.onClone,
            loadingStates.isCloning,
          )
        : null,
      createMirrorAction(
        selectedIngredient,
        handlers.onMirror,
        loadingStates.isMirroring,
      ),
      // Reverse is video-only
      isVideo
        ? createReverseAction(
            selectedIngredient,
            handlers.onReverse,
            loadingStates.isReversing,
          )
        : null,
      createConvertToPresetAction(
        selectedIngredient,
        handlers.onConvertToPreset,
        loadingStates.isPublishing,
      ),
      createDeleteAction(
        selectedIngredient,
        handlers.onDelete,
        loadingStates.isDeleting,
      ),
    );

    return compactActions(actionsList);
  }, [selectedIngredient, handlers, isVideo, loadingStates]);

  const primaryActions = useMemo(() => {
    if (!selectedIngredient) {
      return [];
    }

    const isProcessing =
      selectedIngredient.status === IngredientStatus.PROCESSING;
    const isGif = selectedIngredient.category === IngredientCategory.GIF;

    const openAction = !isGif
      ? createSeeDetailsAction(selectedIngredient, handlers.onSeeDetails)
      : null;
    const availableDownloadAction = createDownloadAction(
      selectedIngredient,
      handlers.onDownload,
      loadingStates.isDownloading,
    );
    const availablePublishAction = createPublishAction(
      selectedIngredient,
      handlers.onPublish,
      loadingStates.isPublishing,
    );

    const toDisabledAction = (
      id: string,
      label: string,
      reason: string,
      action?: IQuickAction | null,
    ): IQuickAction => {
      if (action) {
        return {
          ...action,
          id,
          isDisabled: true,
          onClick: () => undefined,
          tooltip: reason,
        };
      }

      return {
        id,
        isDisabled: true,
        label,
        onClick: () => undefined,
        showInMenu: true,
        tooltip: reason,
      };
    };

    const resolvedOpenAction =
      openAction ??
      toDisabledAction(
        'open',
        'Open',
        isGif
          ? 'Open is unavailable for this asset'
          : 'Open is available in supported scopes only',
      );

    const resolvedDownloadAction = isProcessing
      ? toDisabledAction(
          'download',
          'Download',
          'Download is unavailable while processing',
          availableDownloadAction,
        )
      : (availableDownloadAction ??
        toDisabledAction(
          'download',
          'Download',
          'Download is locked. Complete setup to unlock.',
        ));

    const resolvedPublishAction = isProcessing
      ? toDisabledAction(
          'publish',
          'Publish',
          'Publish is unavailable while processing',
          availablePublishAction,
        )
      : (availablePublishAction ??
        toDisabledAction(
          'publish',
          'Publish',
          'Publish is locked. Complete setup to unlock.',
        ));

    const actionMap = buildActionMap(
      compactActions([
        resolvedOpenAction,
        resolvedDownloadAction,
        resolvedPublishAction,
        ...generatedActions,
      ]),
    );

    if (isProcessing) {
      return compactActions([
        getActionById(actionMap, resolvedOpenAction.id),
        getActionById(actionMap, 'download'),
        getActionById(actionMap, 'publish'),
      ]);
    }

    if (isVideo) {
      return selectPrimaryActions(
        actionMap,
        ['see-details', 'trim', 'captions'],
        'download',
        ['download', 'publish', 'share'],
      );
    }

    if (isGif) {
      return selectPrimaryActions(
        actionMap,
        ['see-details', 'download', 'share'],
        null,
        ['favorite', 'publish'],
      );
    }

    return selectPrimaryActions(
      actionMap,
      ['see-details', 'create-variation', 'convert-to-video'],
      'download',
      ['download', 'publish', 'share'],
    );
  }, [
    generatedActions,
    handlers.onSeeDetails,
    handlers.onDownload,
    handlers.onPublish,
    isVideo,
    loadingStates.isDownloading,
    loadingStates.isPublishing,
    selectedIngredient,
  ]);

  const menuActions = useMemo(() => {
    const primaryActionIds = new Set(primaryActions.map((action) => action.id));

    const filteredMenuActions = generatedActions.filter((action) => {
      if (!action.showInMenu || primaryActionIds.has(action.id)) {
        return false;
      }

      if (hasPromptControl && action.id === 'prompt') {
        return false;
      }

      return true;
    });

    return applyMenuSections(filteredMenuActions);
  }, [generatedActions, hasPromptControl, primaryActions]);

  const mainActions = useMemo(() => primaryActions, [primaryActions]);

  const actions = useMemo(
    () => [...primaryActions, ...menuActions],
    [menuActions, primaryActions],
  );

  return {
    actions,
    contextActions,
    mainActions,
    menuActions,
    primaryActions,
  };
}
