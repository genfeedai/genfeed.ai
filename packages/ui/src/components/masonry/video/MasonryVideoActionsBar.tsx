'use client';

import type { AssetScope } from '@genfeedai/contracts';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  IIngredient,
  ITag,
  IVideo,
} from '@genfeedai/contracts/interfaces';
import type { MasonryActionStates } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';
import { ThumbsUp } from 'lucide-react';
import type { MouseEvent } from 'react';

type VideoActionHandlers = {
  handlePublish: (ingredient: IVideo) => void;
  handleUpscale: (ingredient: IVideo) => void;
  handleExtend: (ingredient: IVideo) => void;
  handleClone: (ingredient: IVideo) => void;
  handleDelete: (ingredient: IVideo) => void;
  handleConvertToGif: (ingredient: IVideo) => void;
  handlePortrait: (ingredient: IVideo) => void;
  handleSquare: (ingredient: IVideo) => void;
  handleLandscape: (ingredient: IVideo) => void;
  handleReverse: (ingredient: IVideo) => void;
  handleMirror: (ingredient: IVideo) => void;
  handleMarkArchived: (ingredient: IVideo) => void;
  handleMarkRejected: (ingredient: IVideo) => void;
  handleMarkValidated: (ingredient: IVideo) => void;
  handleCopyPrompt: (ingredient: IVideo) => void;
  handleReprompt: (ingredient: IVideo) => void;
  handleShare: (ingredient: IVideo) => void;
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
  onGenerateCaptions?: (ingredient: IVideo) => void;
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
  onGenerateCaptions,
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
        'absolute top-2 right-2 z-50 overflow-visible transition-opacity duration-200 focus-within:opacity-100 focus-within:pointer-events-auto',
        isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none',
        'group-hover:opacity-100',
      )}
    >
      <div className="flex items-start justify-end gap-2">
        <div className="flex-shrink-0 flex items-center gap-2">
          {onVoteIngredient ? (
            <Button
              label={
                <>
                  <ThumbsUp /> {video.totalVotes || 0}
                </>
              }
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              className={`${
                video.hasVoted
                  ? 'cursor-default bg-success text-success-foreground'
                  : ''
              } ${video.isVoteAnimating ? 'animate-vote' : ''}`}
              onClick={() => onVoteIngredient?.(video)}
            />
          ) : (
            !isUnavailable && (
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
                  onShare={onShareIngredient || handlers.handleShare}
                  onUpscale={handlers.handleUpscale}
                  onExtend={handlers.handleExtend}
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
                  onMarkValidated={
                    onMarkValidated || handlers.handleMarkValidated
                  }
                  onMarkRejected={onMarkRejected || handlers.handleMarkRejected}
                  onToggleFavorite={onToggleFavorite}
                  onCopy={onCopyPrompt || handlers.handleCopyPrompt}
                  onReprompt={onReprompt}
                  onGenerateCaptions={onGenerateCaptions}
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
