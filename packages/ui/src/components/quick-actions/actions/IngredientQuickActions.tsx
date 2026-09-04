'use client';

import { ComponentSize, IngredientCategory } from '@genfeedai/contracts';
import type { IQuickAction } from '@genfeedai/contracts/interfaces/ui/quick-actions.interface';
import {
  BG_BLUR,
  BORDER_WHITE_30,
  cn,
} from '@genfeedai/helpers/formatting/cn/cn.util';
import { useQuickActions } from '@genfeedai/hooks/ui/use-quick-actions/use-quick-actions';
import type { StudioQuickActionsProps } from '@genfeedai/props/studio/studio.props';
import QuickActionButton from '@ui/quick-actions/button/QuickActionButton';
import QuickActionsMenu from '@ui/quick-actions/menu/QuickActionsMenu';
import { QUICK_ACTION_TRIGGER_CLASS } from '@ui/quick-actions/quick-actions.constants';
import { useCallback, useMemo, useState } from 'react';
import IngredientContextActions from './IngredientContextActions';

export default function IngredientQuickActions(
  props: StudioQuickActionsProps & { isMasonryCompact?: boolean },
): React.ReactNode {
  const {
    align = 'end',
    isMasonryCompact = false,
    selectedIngredient,
    size = ComponentSize.SM,
    onCopy,
    onRefresh,
    onReprompt,
    onScopeChange,
  } = props;

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isVideo = selectedIngredient?.category === IngredientCategory.VIDEO;

  const {
    onAddTextOverlay,
    onClone,
    onConvertToGif,
    onConvertToPreset,
    onConvertToVideo,
    onCreateVariation,
    onDelete,
    onDownload,
    onEdit,
    onExtend,
    onGenerateCaptions,
    onLandscape,
    onManageTags,
    onMarkArchived,
    onMarkRejected,
    onMarkValidated,
    onMirror,
    onMoreOptions,
    onPortrait,
    onPublish,
    onReverse,
    onSeeDetails,
    onSetAsBanner,
    onSetAsLogo,
    onShare,
    onShowPrompt,
    onSquare,
    onToggleFavorite,
    onTrim,
    onUpscale,
    onUseAsVideoReference,
    onUsePrompt,
    onVote,
    isAddingTextOverlay,
    isCloning,
    isConverting,
    isConvertingToVideo,
    isDeleting,
    isExtending,
    isDownloading,
    isGeneratingCaptions,
    isLandscaping,
    isMarkingArchived,
    isMarkingRejected,
    isMarkingValidated,
    isMirroring,
    isPortraiting,
    isPublishing,
    isSettingAsBanner,
    isSettingAsLogo,
    isSquaring,
    isTogglingFavorite,
    isTrimming,
    isUpscaling,
    isUsingPrompt,
    isVoting,
  } = props;

  const handlers = useMemo(
    () => ({
      onAddTextOverlay,
      onClone,
      onConvertToGif,
      onConvertToPreset,
      onConvertToVideo,
      onCopy,
      onCreateVariation,
      onDelete,
      onDownload,
      onEdit,
      onExtend,
      onGenerateCaptions,
      onLandscape,
      onManageTags,
      onMarkArchived,
      onMarkRejected,
      onMarkValidated,
      onMirror,
      onMoreOptions,
      onPortrait,
      onPublish,
      onReverse,
      onSeeDetails,
      onSetAsBanner,
      onSetAsLogo,
      onShare,
      onShowPrompt,
      onSquare,
      onToggleFavorite,
      onTrim,
      onUpscale,
      onUseAsVideoReference,
      onUsePrompt: onUsePrompt ?? onReprompt,
      onVote,
    }),
    [
      onAddTextOverlay,
      onClone,
      onConvertToGif,
      onConvertToPreset,
      onConvertToVideo,
      onCopy,
      onCreateVariation,
      onDelete,
      onDownload,
      onEdit,
      onExtend,
      onGenerateCaptions,
      onLandscape,
      onManageTags,
      onMarkArchived,
      onMarkRejected,
      onMarkValidated,
      onMirror,
      onMoreOptions,
      onPortrait,
      onPublish,
      onReverse,
      onSeeDetails,
      onSetAsBanner,
      onSetAsLogo,
      onShare,
      onShowPrompt,
      onSquare,
      onToggleFavorite,
      onTrim,
      onUpscale,
      onUseAsVideoReference,
      onUsePrompt,
      onReprompt,
      onVote,
    ],
  );

  const loadingStates = useMemo(
    () => ({
      isAddingTextOverlay: isAddingTextOverlay ?? false,
      isCloning: isCloning ?? false,
      isConverting: isConverting ?? false,
      isConvertingToVideo: isConvertingToVideo ?? false,
      isDeleting: isDeleting ?? false,
      isExtending: isExtending ?? false,
      isDownloading: isDownloading ?? false,
      isGeneratingCaptions: isGeneratingCaptions ?? false,
      isLandscaping: isLandscaping ?? false,
      isMarkingArchived: isMarkingArchived ?? false,
      isMarkingRejected: isMarkingRejected ?? false,
      isMarkingValidated: isMarkingValidated ?? false,
      isMirroring: isMirroring ?? false,
      isPortraiting: isPortraiting ?? false,
      isPublishing: isPublishing ?? false,
      isSettingAsBanner: isSettingAsBanner ?? false,
      isSettingAsLogo: isSettingAsLogo ?? false,
      isSquaring: isSquaring ?? false,
      isTogglingFavorite: isTogglingFavorite ?? false,
      isTrimming: isTrimming ?? false,
      isUpscaling: isUpscaling ?? false,
      isUsingPrompt: isUsingPrompt ?? false,
      isVoting: isVoting ?? false,
    }),
    [
      isAddingTextOverlay,
      isCloning,
      isConverting,
      isConvertingToVideo,
      isDeleting,
      isExtending,
      isDownloading,
      isGeneratingCaptions,
      isLandscaping,
      isMarkingArchived,
      isMarkingRejected,
      isMarkingValidated,
      isMirroring,
      isPortraiting,
      isPublishing,
      isSettingAsBanner,
      isSettingAsLogo,
      isSquaring,
      isTogglingFavorite,
      isTrimming,
      isUpscaling,
      isUsingPrompt,
      isVoting,
    ],
  );

  const { actions, contextActions, menuActions, primaryActions } =
    useQuickActions({
      handlers,
      hasPromptControl: Boolean(
        !isMasonryCompact && selectedIngredient?.promptText && onCopy,
      ),
      hasScopeControl: Boolean(!isMasonryCompact && onScopeChange),
      hasStatusControl: Boolean(!isMasonryCompact && onRefresh),
      isVideo,
      loadingStates,
      selectedIngredient,
    });

  const handleActionClick = useCallback(async (action: IQuickAction) => {
    await action.onClick();
    setIsMenuOpen(false);
  }, []);

  if (!selectedIngredient) {
    return null;
  }
  if (actions.length === 0 && contextActions.length === 0) {
    return null;
  }

  // Dropdown triggers use ButtonVariant.UNSTYLED internally, so they take the
  // shared quick-action trigger base plus a quieter treatment for context
  // controls.
  const dropdownButtonClassName = cn(
    QUICK_ACTION_TRIGGER_CLASS,
    'text-muted-foreground hover:bg-hover hover:text-foreground',
  );

  const alignmentClass = align === 'start' ? 'justify-start' : 'justify-end';
  // Shell radius comes from BORDER_WHITE_30 (rounded-lg) — square buttons in a
  // pill shell was exactly the mismatch the quick-action sweep removed.
  const sharedShellClassName = cn(
    isMasonryCompact
      ? 'rounded-lg bg-secondary/80 p-0.5 shadow-dropdown'
      : cn(BG_BLUR, BORDER_WHITE_30, 'p-1'),
    'quick-actions-wrapper transition-colors duration-300',
  );

  // A masonry tile shows one control at rest: the overflow menu. Primary
  // actions are not deleted, they move to the top of that menu so the media
  // keeps the whole tile.
  if (isMasonryCompact) {
    return (
      <div className={cn('flex items-center', alignmentClass)}>
        <div
          data-testid="masonry-compact-actions"
          className={cn(sharedShellClassName, 'flex items-center')}
        >
          <QuickActionsMenu
            actions={actions}
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            size={size}
            onActionClick={handleActionClick}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', alignmentClass)}>
      {contextActions.length > 0 && (
        <IngredientContextActions
          contextActions={contextActions}
          selectedIngredient={selectedIngredient}
          onCopy={handlers.onCopy}
          onReprompt={onReprompt}
          onRefresh={onRefresh}
          onScopeChange={onScopeChange}
          dropdownButtonClassName={dropdownButtonClassName}
          sharedShellClassName={sharedShellClassName}
        />
      )}

      <div
        data-testid="primary-actions-group"
        className={cn(sharedShellClassName, 'flex items-center gap-1')}
      >
        {primaryActions.map((action) => (
          <QuickActionButton
            key={action.id}
            action={action}
            size={size}
            showLabel={false}
            onClick={handleActionClick}
          />
        ))}

        {menuActions.length > 0 && (
          <QuickActionsMenu
            actions={menuActions}
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            size={size}
            onActionClick={handleActionClick}
          />
        )}
      </div>
    </div>
  );
}
