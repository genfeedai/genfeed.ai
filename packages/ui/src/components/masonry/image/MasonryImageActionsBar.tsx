'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  IImage,
  IIngredient,
  ITag,
} from '@genfeedai/contracts/interfaces';
import type { MasonryActionStates } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type useIngredientActions from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import type { MasonryImageProps } from '@genfeedai/props/content/masonry.props';
import type { createDownloadHandler } from '@ui/masonry/shared/useMasonryHover';
import { Button } from '@ui/primitives/button';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';
import { ThumbsUp } from 'lucide-react';
import type { MouseEvent } from 'react';

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
          <ThumbsUp />{' '}
          <span className="tabular-nums">{image.totalVotes || 0}</span>
        </>
      }
      variant={image.hasVoted ? ButtonVariant.DEFAULT : ButtonVariant.DEFAULT}
      size={ButtonSize.SM}
      className={cn(
        image.hasVoted && 'cursor-default bg-success text-success-foreground',
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
        onShare={onShareIngredient || handlers.handleShare}
        onDelete={handlers.handleDelete}
        onToggleFavorite={onToggleFavorite}
        onCopy={onCopyPrompt || handlers.handleCopyPrompt}
        onReprompt={onReprompt}
        onConvertToVideo={onConvertToVideo}
        onUseAsVideoReference={onUseAsVideoReference}
        onCreateVariation={onCreateVariation}
        onReverse={onReverse || handlers.handleReverse}
        onMirror={onMirror || handlers.handleMirror}
        onPortrait={handlers.handlePortrait}
        onSquare={handlers.handleSquare}
        onLandscape={handlers.handleLandscape}
        onMarkValidated={onMarkValidated || handlers.handleMarkValidated}
        onMarkRejected={onMarkRejected || handlers.handleMarkRejected}
        onMarkArchived={onMarkArchived || handlers.handleMarkArchived}
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
        'absolute top-2 right-2 z-50 overflow-visible transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100 focus-within:pointer-events-auto',
        showActions ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
    >
      <div className="flex items-start justify-end gap-2">
        <div className="flex-shrink-0 flex items-center gap-2">
          {onVoteIngredient ? (
            <VoteButton image={image} onVote={onVoteIngredient} />
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}
