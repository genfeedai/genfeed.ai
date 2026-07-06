'use client';

import type { AssetScope } from '@genfeedai/enums';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IIngredient, ITag, IVideo } from '@genfeedai/interfaces';
import type { MasonryActionStates } from '@genfeedai/interfaces/hooks/hooks.interface';
import { Button } from '@ui/primitives/button';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';
import type { MouseEvent } from 'react';
import { HiHandThumbUp } from 'react-icons/hi2';

type VideoActionHandlers = {
  handlePublish: (ingredient: IVideo) => void;
  handleUpscale: (ingredient: IVideo) => void;
  handleClone: (ingredient: IVideo) => void;
  handleDelete: (ingredient: IVideo) => void;
  handleConvertToGif: (ingredient: IVideo) => void;
  handlePortrait: (ingredient: IVideo) => void;
  handleSquare: (ingredient: IVideo) => void;
  handleLandscape: (ingredient: IVideo) => void;
  handleReverse: (ingredient: IVideo) => void;
  handleMirror: (ingredient: IVideo) => void;
  handleMarkArchived: (ingredient: IVideo) => void;
};

type MasonryVideoActionsBarProps = {
  video: IVideo;
  isHovered: boolean;
  isActionsEnabled: boolean;
  isUnavailable: boolean;
  isSelected: boolean;
  isPortraiting: boolean;
  isGeneratingCaptions: boolean;
  isMirroring: boolean;
  isReversing: boolean;
  actionStates: MasonryActionStates;
  handlers: VideoActionHandlers;
  availableTags?: ITag[];
  isLoadingTags?: boolean;
  handleDownload: (
    ingredient: IIngredient,
  ) => Promise<Window | null | undefined> | undefined;
  handleQuickActionsMouseEnter: () => void;
  handleQuickActionsMouseLeave: (e: MouseEvent) => void;
  onVoteIngredient?: (ingredient: IVideo) => void;
  onShareIngredient?: (ingredient: IVideo) => void;
  onSeeDetails?: (ingredient: IVideo) => void;
  onMarkValidated?: (ingredient: IVideo) => void;
  onMarkRejected?: (ingredient: IVideo) => void;
  onToggleFavorite?: (ingredient: IVideo) => void;
  onCopyPrompt?: (ingredient: IVideo) => void;
  onReprompt?: (ingredient: IVideo) => void;
  onScopeChange?: (scope: AssetScope, updatedItem?: IVideo) => void;
  onRefresh?: () => void;
  onReverse?: (ingredient: IVideo) => void;
  onMirror?: (ingredient: IVideo) => void;
};

export default function MasonryVideoActionsBar({
  video,
  isHovered,
  isActionsEnabled,
  isUnavailable,
  isSelected,
  isPortraiting,
  isGeneratingCaptions,
  isMirroring,
  isReversing,
  actionStates,
  handlers,
  availableTags,
  isLoadingTags,
  handleDownload,
  handleQuickActionsMouseEnter,
  handleQuickActionsMouseLeave,
  onVoteIngredient,
  onShareIngredient,
  onSeeDetails,
  onMarkValidated,
  onMarkRejected,
  onToggleFavorite,
  onCopyPrompt,
  onReprompt,
  onScopeChange,
  onRefresh,
  onReverse,
  onMirror,
}: MasonryVideoActionsBarProps) {
  if (!isActionsEnabled) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-50 w-full overflow-visible border-t border-white/[0.08] bg-black/72 p-2 backdrop-blur-sm transition-opacity duration-200',
        isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none',
        'group-hover:opacity-100',
      )}
    >
      <div className="flex items-end justify-end gap-2">
        <div className="flex-shrink-0 flex items-center gap-2">
          {onVoteIngredient ? (
            <Button
              label={
                <>
                  <HiHandThumbUp /> {video.totalVotes || 0}
                </>
              }
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              className={`${
                video.hasVoted ? 'bg-success text-white cursor-default' : ''
              } ${video.isVoteAnimating ? 'animate-vote' : ''}`}
              onClick={() => onVoteIngredient?.(video)}
            />
          ) : (
            !isUnavailable &&
            isHovered && (
              <div
                role="presentation"
                className="quick-actions-wrapper flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseEnter={handleQuickActionsMouseEnter}
                onMouseLeave={handleQuickActionsMouseLeave}
              >
                <IngredientQuickActions
                  {...actionStates}
                  isMasonryCompact
                  selectedIngredient={video}
                  availableTags={availableTags}
                  isLoadingTags={isLoadingTags}
                  isPortraiting={isPortraiting}
                  isGeneratingCaptions={isGeneratingCaptions}
                  isMirroring={isMirroring}
                  isReversing={isReversing}
                  isSelected={isSelected}
                  onPublish={handlers.handlePublish}
                  onShare={onShareIngredient}
                  onUpscale={handlers.handleUpscale}
                  onClone={handlers.handleClone}
                  onDelete={handlers.handleDelete}
                  onConvertToGif={handlers.handleConvertToGif}
                  onPortrait={handlers.handlePortrait}
                  onSquare={handlers.handleSquare}
                  onLandscape={handlers.handleLandscape}
                  onReverse={onReverse || handlers.handleReverse}
                  onMirror={onMirror || handlers.handleMirror}
                  onSeeDetails={onSeeDetails}
                  onMarkArchived={handlers.handleMarkArchived}
                  onMarkValidated={onMarkValidated}
                  onMarkRejected={onMarkRejected}
                  onToggleFavorite={onToggleFavorite}
                  onCopy={onCopyPrompt}
                  onReprompt={onReprompt}
                  onDownload={handleDownload}
                  onScopeChange={onScopeChange}
                  onRefresh={onRefresh}
                />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
