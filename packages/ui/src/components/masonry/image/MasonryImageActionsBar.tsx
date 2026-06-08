'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type useIngredientActions from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import type { IImage, IIngredient, ITag } from '@genfeedai/interfaces';
import type { MasonryActionStates } from '@genfeedai/interfaces/hooks/hooks.interface';
import type { MasonryImageProps } from '@genfeedai/props/content/masonry.props';
import type { createDownloadHandler } from '@ui/masonry/shared/useMasonryHover';
import { Button } from '@ui/primitives/button';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';
import type { MouseEvent } from 'react';
import { HiHandThumbUp } from 'react-icons/hi2';

type ImageActionHandlers = ReturnType<typeof useIngredientActions>['handlers'];

type MasonryImageActionsBarProps = {
  image: IImage;
  isActionsEnabled: boolean;
  isSelected: boolean;
  showActions: boolean;
  actionStates: MasonryActionStates;
  handlers: ImageActionHandlers;
  availableTags?: ITag[];
  isLoadingTags?: boolean;
  handleDownload: ReturnType<typeof createDownloadHandler>;
  handleQuickActionsMouseEnter: () => void;
  handleQuickActionsMouseLeave: (e: MouseEvent) => void;
  onVoteIngredient?: MasonryImageProps['onVoteIngredient'];
  onPublishIngredient?: MasonryImageProps['onPublishIngredient'];
  onSeeDetails?: MasonryImageProps['onSeeDetails'];
  onShareIngredient?: MasonryImageProps['onShareIngredient'];
  onToggleFavorite?: MasonryImageProps['onToggleFavorite'];
  onCopyPrompt?: MasonryImageProps['onCopyPrompt'];
  onReprompt?: MasonryImageProps['onReprompt'];
  onConvertToVideo?: MasonryImageProps['onConvertToVideo'];
  onUseAsVideoReference?: MasonryImageProps['onUseAsVideoReference'];
  onCreateVariation?: MasonryImageProps['onCreateVariation'];
  onReverse?: MasonryImageProps['onReverse'];
  onMirror?: MasonryImageProps['onMirror'];
  onMarkValidated?: MasonryImageProps['onMarkValidated'];
  onMarkRejected?: MasonryImageProps['onMarkRejected'];
  onMarkArchived?: MasonryImageProps['onMarkArchived'];
  onScopeChange?: MasonryImageProps['onScopeChange'];
  onRefresh?: MasonryImageProps['onRefresh'];
};

interface VoteButtonProps {
  image: IImage;
  onVote: (image: IImage) => void;
}

function VoteButton({ image, onVote }: VoteButtonProps): React.ReactElement {
  return (
    <Button
      onClick={() => onVote(image)}
      label={
        <>
          <HiHandThumbUp /> {image.totalVotes || 0}
        </>
      }
      variant={image.hasVoted ? ButtonVariant.DEFAULT : ButtonVariant.DEFAULT}
      size={ButtonSize.SM}
      className={cn(
        image.hasVoted && 'bg-success text-white cursor-default',
        image.isVoteAnimating && 'animate-vote',
      )}
    />
  );
}

interface QuickActionsWrapperProps {
  image: IImage;
  actionStates: MasonryActionStates;
  handlers: ImageActionHandlers;
  availableTags?: ITag[];
  isLoadingTags?: boolean;
  isSelected: boolean;
  handleDownload: (ingredient: IIngredient) => Promise<undefined>;
  handleQuickActionsMouseEnter: () => void;
  handleQuickActionsMouseLeave: (e: MouseEvent) => void;
  onPublishIngredient?: MasonryImageProps['onPublishIngredient'];
  onSeeDetails?: MasonryImageProps['onSeeDetails'];
  onShareIngredient?: MasonryImageProps['onShareIngredient'];
  onToggleFavorite?: MasonryImageProps['onToggleFavorite'];
  onCopyPrompt?: MasonryImageProps['onCopyPrompt'];
  onReprompt?: MasonryImageProps['onReprompt'];
  onConvertToVideo?: MasonryImageProps['onConvertToVideo'];
  onUseAsVideoReference?: MasonryImageProps['onUseAsVideoReference'];
  onCreateVariation?: MasonryImageProps['onCreateVariation'];
  onReverse?: MasonryImageProps['onReverse'];
  onMirror?: MasonryImageProps['onMirror'];
  onMarkValidated?: MasonryImageProps['onMarkValidated'];
  onMarkRejected?: MasonryImageProps['onMarkRejected'];
  onMarkArchived?: MasonryImageProps['onMarkArchived'];
  onScopeChange?: MasonryImageProps['onScopeChange'];
  onRefresh?: MasonryImageProps['onRefresh'];
}

function QuickActionsWrapper({
  image,
  actionStates,
  handlers,
  availableTags,
  isLoadingTags,
  isSelected,
  handleDownload,
  handleQuickActionsMouseEnter,
  handleQuickActionsMouseLeave,
  onPublishIngredient,
  onSeeDetails,
  onShareIngredient,
  onToggleFavorite,
  onCopyPrompt,
  onReprompt,
  onConvertToVideo,
  onUseAsVideoReference,
  onCreateVariation,
  onReverse,
  onMirror,
  onMarkValidated,
  onMarkRejected,
  onMarkArchived,
  onScopeChange,
  onRefresh,
}: QuickActionsWrapperProps): React.ReactElement {
  return (
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
        selectedIngredient={image}
        availableTags={availableTags}
        isLoadingTags={isLoadingTags}
        isSelected={isSelected}
        onPublish={onPublishIngredient}
        onUpscale={handlers.handleUpscale}
        onClone={handlers.handleClone}
        onSeeDetails={onSeeDetails}
        onShare={onShareIngredient}
        onDelete={handlers.handleDelete}
        onToggleFavorite={onToggleFavorite}
        onCopy={onCopyPrompt}
        onReprompt={onReprompt}
        onConvertToVideo={onConvertToVideo}
        onUseAsVideoReference={onUseAsVideoReference}
        onCreateVariation={onCreateVariation}
        onReverse={onReverse || handlers.handleReverse}
        onMirror={onMirror || handlers.handleMirror}
        onPortrait={handlers.handlePortrait}
        onSquare={handlers.handleSquare}
        onLandscape={handlers.handleLandscape}
        onMarkValidated={onMarkValidated}
        onMarkRejected={onMarkRejected}
        onMarkArchived={onMarkArchived}
        onSetAsLogo={handlers.handleSetAsLogo}
        onSetAsBanner={handlers.handleSetAsBanner}
        onDownload={async (ingredient) => {
          await handleDownload(ingredient);
          return undefined;
        }}
        onScopeChange={onScopeChange}
        onRefresh={onRefresh}
      />
    </div>
  );
}

export default function MasonryImageActionsBar({
  image,
  isActionsEnabled,
  isSelected,
  showActions,
  actionStates,
  handlers,
  availableTags,
  isLoadingTags,
  handleDownload,
  handleQuickActionsMouseEnter,
  handleQuickActionsMouseLeave,
  onVoteIngredient,
  onPublishIngredient,
  onSeeDetails,
  onShareIngredient,
  onToggleFavorite,
  onCopyPrompt,
  onReprompt,
  onConvertToVideo,
  onUseAsVideoReference,
  onCreateVariation,
  onReverse,
  onMirror,
  onMarkValidated,
  onMarkRejected,
  onMarkArchived,
  onScopeChange,
  onRefresh,
}: MasonryImageActionsBarProps): React.ReactElement | null {
  if (!isActionsEnabled) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-50 border-t border-white/[0.08] bg-black/72 p-2 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 overflow-visible',
        showActions ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
    >
      <div className="flex items-end justify-end gap-2">
        <div className="flex-shrink-0 flex items-center gap-2">
          {onVoteIngredient ? (
            <VoteButton image={image} onVote={onVoteIngredient} />
          ) : (
            showActions && (
              <QuickActionsWrapper
                image={image}
                actionStates={actionStates}
                handlers={handlers}
                availableTags={availableTags}
                isLoadingTags={isLoadingTags}
                isSelected={isSelected}
                handleDownload={handleDownload}
                handleQuickActionsMouseEnter={handleQuickActionsMouseEnter}
                handleQuickActionsMouseLeave={handleQuickActionsMouseLeave}
                onPublishIngredient={onPublishIngredient}
                onSeeDetails={onSeeDetails}
                onShareIngredient={onShareIngredient}
                onToggleFavorite={onToggleFavorite}
                onCopyPrompt={onCopyPrompt}
                onReprompt={onReprompt}
                onConvertToVideo={onConvertToVideo}
                onUseAsVideoReference={onUseAsVideoReference}
                onCreateVariation={onCreateVariation}
                onReverse={onReverse}
                onMirror={onMirror}
                onMarkValidated={onMarkValidated}
                onMarkRejected={onMarkRejected}
                onMarkArchived={onMarkArchived}
                onScopeChange={onScopeChange}
                onRefresh={onRefresh}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
