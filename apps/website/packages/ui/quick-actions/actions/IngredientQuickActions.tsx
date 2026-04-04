'use client';

import type { IIngredient } from '@genfeedai/interfaces';
import type { IQuickAction } from '@genfeedai/interfaces/ui/quick-actions.interface';
import {
  ComponentSize,
  DropdownDirection,
  IngredientCategory,
} from '@genfeedai/enums';
import { BG_BLUR, BORDER_WHITE_30, cn } from '@helpers/formatting/cn/cn.util';
import { useQuickActions } from '@hooks/ui/use-quick-actions/use-quick-actions';
import type { StudioQuickActionsProps } from '@props/studio/studio.props';
import DropdownPrompt from '@ui/dropdowns/prompt/DropdownPrompt';
import DropdownScope from '@ui/dropdowns/scope/DropdownScope';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import QuickActionButton from '@ui/quick-actions/button/QuickActionButton';
import QuickActionsMenu from '@ui/quick-actions/menu/QuickActionsMenu';
import { useCallback, useMemo, useState } from 'react';

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
    ],
  );

  const loadingStates = useMemo(
    () => ({
      isAddingTextOverlay: isAddingTextOverlay ?? false,
      isCloning: isCloning ?? false,
      isConverting: isConverting ?? false,
      isConvertingToVideo: isConvertingToVideo ?? false,
      isDeleting: isDeleting ?? false,
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

  // Dropdown triggers use ButtonVariant.UNSTYLED internally, so we replicate
  // the Button base styles here with a quieter treatment for context controls.
  const dropdownButtonClassName = cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    'h-8 px-3 text-xs',
    'text-white/55 hover:text-white hover:bg-white/6',
    'rounded-full transition-all duration-300',
  );

  const alignmentClass = align === 'start' ? 'justify-start' : 'justify-end';
  const sharedShellClassName = cn(
    BG_BLUR,
    BORDER_WHITE_30,
    'quick-actions-wrapper rounded-full border-white/10 p-1 shadow-[0_12px_32px_rgba(0,0,0,0.22)] transition-all duration-300 hover:border-white/15',
  );

  return (
    <div className={cn('flex flex-wrap items-center gap-2', alignmentClass)}>
      {!isMasonryCompact && contextActions.length > 0 && (
        <div
          data-testid="context-actions-group"
          className={cn(sharedShellClassName, 'flex items-center gap-1')}
        >
          {contextActions.some((action) => action.id === 'prompt') && (
            <DropdownPrompt
              promptText={selectedIngredient.promptText ?? ''}
              direction={DropdownDirection.UP}
              className={dropdownButtonClassName}
              onCopy={() => {
                if (handlers.onCopy) {
                  handlers.onCopy(selectedIngredient);
                }
              }}
              onReprompt={
                onReprompt ? () => onReprompt(selectedIngredient) : undefined
              }
            />
          )}

          {contextActions.some((action) => action.id === 'status') && (
            <DropdownStatus
              entity={selectedIngredient}
              onStatusChange={onRefresh}
              className={dropdownButtonClassName}
              position="bottom-full"
            />
          )}

          {contextActions.some((action) => action.id === 'scope') && (
            <DropdownScope
              item={selectedIngredient}
              className={dropdownButtonClassName}
              position="bottom-full"
              onScopeChange={(scope, updatedItem) => {
                onScopeChange?.(scope, updatedItem as IIngredient);
                onRefresh?.();
              }}
            />
          )}
        </div>
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
