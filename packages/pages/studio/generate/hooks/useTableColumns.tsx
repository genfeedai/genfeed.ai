'use client';

import {
  type ArticleStatus,
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientStatus,
  type PostStatus,
} from '@genfeedai/enums';
import type {
  IArticle,
  IIngredient,
  IMetadata,
  IPost,
} from '@genfeedai/interfaces';
import type { UseTableColumnsParams } from '@pages/studio/generate/types';
import {
  formatDuration,
  hasDuration,
  isIngredient,
} from '@pages/studio/generate/utils/helpers';
import type { TableAction } from '@props/ui/display/table.props';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { resolveIngredientReferenceUrl } from '@utils/media/reference.util';
import Image from 'next/image';
import type { MouseEvent } from 'react';
import { useCallback, useMemo } from 'react';
import {
  HiClipboardDocument,
  HiEye,
  HiInformationCircle,
  HiPause,
  HiPencil,
  HiPlay,
  HiStar,
  HiVideoCamera,
} from 'react-icons/hi2';

export function useTableColumns({
  categoryType,
  allAssets,
  handleCopy,
  handleMusicPlay,
  setLightboxIndex,
  setLightboxOpen,
  findAllAssets,
  openPostBatchModal,
}: UseTableColumnsParams) {
  const renderMusicThumbnail = useCallback(
    (item: IIngredient) => {
      const metadataObject =
        typeof item.metadata === 'object' && item.metadata !== null
          ? (item.metadata as IMetadata)
          : undefined;

      const description =
        item.metadataDescription ??
        metadataObject?.description ??
        item.promptText ??
        item.metadataLabel ??
        metadataObject?.label ??
        undefined;

      const isProcessing = item.status === IngredientStatus.PROCESSING;
      const isPlayable = Boolean(item.ingredientUrl);
      const isDisabled = isProcessing || !isPlayable;

      return (
        <div className="flex items-center gap-3">
          <Button
            label={
              item.isPlaying ? (
                <HiPause className="text-lg" />
              ) : (
                <HiPlay className="text-lg" />
              )
            }
            size={ButtonSize.ICON}
            variant={
              item.isPlaying ? ButtonVariant.DEFAULT : ButtonVariant.GHOST
            }
            isDisabled={isDisabled}
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              handleMusicPlay(item);
            }}
            tooltip={item.isPlaying ? 'Pause' : 'Play'}
          />

          <div className="flex flex-col text-xs text-foreground/60">
            {description && (
              <span className="truncate max-w-40">{description}</span>
            )}
            {item.provider && (
              <span className="capitalize">{item.provider}</span>
            )}
            {!isPlayable && !isProcessing && (
              <span className="text-error text-xs">Unavailable</span>
            )}
          </div>

          {isProcessing && (
            <div className="w-4 h-4 rounded-full bg-foreground/20 animate-pulse" />
          )}
        </div>
      );
    },
    [handleMusicPlay],
  );

  const renderVisualThumbnail = useCallback(
    (item: IIngredient) => {
      const index = allAssets.findIndex((asset) => asset.id === item.id);
      const referenceImageUrl = resolveIngredientReferenceUrl(item.references);
      const hasMedia = Boolean(
        item.ingredientUrl || item.thumbnailUrl || referenceImageUrl,
      );
      const isProcessing = item.status === IngredientStatus.PROCESSING;

      return (
        <div
          className="w-16 h-16 overflow-hidden bg-background relative group cursor-pointer"
          onClick={() => {
            if (hasMedia && index !== -1) {
              setLightboxIndex(index);
              setLightboxOpen(true);
            }
          }}
        >
          {(item.category === IngredientCategory.VIDEO ||
            item.category === IngredientCategory.AVATAR) &&
          item.ingredientUrl ? (
            <VideoPlayer
              src={item.ingredientUrl}
              thumbnail={item.thumbnailUrl || referenceImageUrl || ''}
              config={{
                autoPlay: false,
                controls: false,
                loop: true,
                muted: true,
                playsInline: true,
                preload: 'metadata',
              }}
            />
          ) : item.category === IngredientCategory.IMAGE &&
            item.ingredientUrl ? (
            <Image
              src={item.ingredientUrl}
              alt={item.metadataLabel || 'Ingredient'}
              className="w-full h-full object-cover"
              width={item.width || 1080}
              height={item.height || 1920}
            />
          ) : item.thumbnailUrl ? (
            <Image
              src={item.thumbnailUrl}
              alt={item.metadataLabel || 'Ingredient'}
              className="w-full h-full object-cover"
              width={item.width || 1080}
              height={item.height || 1920}
            />
          ) : referenceImageUrl ? (
            <Image
              src={referenceImageUrl}
              alt={item.metadataLabel || 'Reference placeholder'}
              className="w-full h-full object-cover"
              width={item.width || 1080}
              height={item.height || 1920}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-foreground/30">
              No media
            </div>
          )}
          {isProcessing && (
            <SimpleTooltip
              label="Generating… should finish shortly"
              position="right"
            >
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-white/30 animate-pulse" />
              </div>
            </SimpleTooltip>
          )}
          {hasMedia && !isProcessing && (
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <HiEye className="w-6 h-6 text-white" />
            </div>
          )}
        </div>
      );
    },
    [allAssets, setLightboxIndex, setLightboxOpen],
  );

  const columns = useMemo(() => {
    return [
      {
        className: categoryType === IngredientCategory.MUSIC ? 'w-48' : 'w-20',
        header: '',
        key: 'thumbnail',
        render: (item: IIngredient) =>
          item.category === IngredientCategory.MUSIC
            ? renderMusicThumbnail(item)
            : renderVisualThumbnail(item),
      },
      {
        header: 'Name',
        key: 'metadataLabel',
        render: (item: IIngredient) => {
          const metadataObject =
            typeof item.metadata === 'object' && item.metadata !== null
              ? (item.metadata as IMetadata)
              : undefined;

          const title =
            item.metadataLabel ?? metadataObject?.label ?? 'Untitled';
          const description =
            item.metadataDescription ?? metadataObject?.description ?? '';
          const descriptionText = description?.substring(0, 50);

          return (
            <div>
              <div className="font-medium">{title}</div>
              {descriptionText && (
                <div className="text-xs text-foreground/60">
                  {descriptionText}
                  {description && description.length > 50 ? '...' : ''}
                </div>
              )}
            </div>
          );
        },
      },
      {
        className: 'max-w-64',
        header: 'Prompt',
        key: 'prompt',
        render: (item: IIngredient) => {
          const promptText = item.promptText;

          if (!promptText) {
            return (
              <span className="text-xs text-foreground/50">No prompt</span>
            );
          }

          const displayPrompt = promptText.substring(0, 60);
          const isTruncated = promptText.length > 60;

          return (
            <div className="flex items-center gap-2 group">
              {isTruncated ? (
                <SimpleTooltip label={promptText} position="top">
                  <div className="text-sm text-foreground/80 cursor-help flex-1">
                    {displayPrompt}...
                  </div>
                </SimpleTooltip>
              ) : (
                <div className="text-sm text-foreground/80 flex-1">
                  {displayPrompt}
                </div>
              )}

              <Button
                withWrapper={false}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(item);
                }}
                variant={ButtonVariant.GHOST}
                size={ButtonSize.XS}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                ariaLabel="Copy prompt to clipboard"
                icon={<HiClipboardDocument className="w-4 h-4" />}
              />
            </div>
          );
        },
      },
      categoryType === IngredientCategory.MUSIC
        ? {
            className: 'w-32',
            header: 'Duration',
            key: 'duration',
            render: (item: IIngredient) => {
              const metadataObject =
                typeof item.metadata === 'object' && item.metadata !== null
                  ? (item.metadata as IMetadata)
                  : undefined;
              const duration =
                item.metadataDuration ??
                metadataObject?.duration ??
                (hasDuration(item) ? item.duration : undefined);

              const formattedDuration = formatDuration(duration);

              if (!formattedDuration) {
                return (
                  <span className="text-xs text-foreground/50">
                    Duration unavailable
                  </span>
                );
              }

              return (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {formattedDuration}
                  </span>
                </div>
              );
            },
          }
        : {
            className: 'w-32',
            header: 'Format',
            key: 'format',
            render: (item: IIngredient) => (
              <div className="flex flex-col gap-2">
                <Badge variant="ghost" value={item.ingredientFormat} />

                {item.metadataWidth && item.metadataHeight && (
                  <span className="text-xs text-foreground/50">
                    {item.metadataWidth}×{item.metadataHeight}
                  </span>
                )}
              </div>
            ),
          },
      {
        className: 'max-w-48',
        header: 'Model',
        key: 'model',
        render: (item: IIngredient) => {
          const model = item.metadataModelLabel || item.metadataModel;

          return (
            <div className="text-sm font-medium truncate cursor-help w-full overflow-hidden">
              {model || 'Unknown'}
            </div>
          );
        },
      },
      {
        className: 'w-40',
        header: 'Status',
        key: 'status',
        render: (item: IIngredient) => (
          <DropdownStatus
            entity={item}
            onStatusChange={async (
              newStatus: IngredientStatus | ArticleStatus | PostStatus,
              updatedItem?: IIngredient | IArticle | IPost,
            ) => {
              if (
                (newStatus === IngredientStatus.VALIDATED ||
                  newStatus === IngredientStatus.GENERATED) &&
                updatedItem &&
                isIngredient(updatedItem)
              ) {
                openPostBatchModal(updatedItem);
              } else {
                await findAllAssets(1, false, true);
              }
            }}
          />
        ),
      },
    ];
  }, [
    categoryType,
    renderMusicThumbnail,
    renderVisualThumbnail,
    findAllAssets,
    handleCopy,
    openPostBatchModal,
  ]);

  return { columns, renderMusicThumbnail, renderVisualThumbnail };
}

export function useTableActions({
  categoryType,
  handleToggleFavorite,
  handleCopy,
  handleEditIngredient,
  handleSeeDetails,
  handleConvertImageToVideo,
}: {
  categoryType: IngredientCategory;
  handleToggleFavorite: (item: IIngredient) => Promise<void>;
  handleCopy: (item: IIngredient) => void;
  handleEditIngredient: (ingredient: IIngredient) => void;
  handleSeeDetails: (ingredient: IIngredient) => void;
  handleConvertImageToVideo: (ingredient: IIngredient) => void;
}) {
  const actions = useMemo(() => {
    const baseActions: TableAction<IIngredient>[] = [
      {
        icon: (item: IIngredient) => (
          <HiStar
            size={16}
            className={item.isFavorite ? 'fill-yellow-500 text-yellow-500' : ''}
          />
        ),
        onClick: handleToggleFavorite,
        tooltip: (item: IIngredient) =>
          item.isFavorite ? 'Remove from favorites' : 'Add to favorites',
        variant: ButtonVariant.GHOST,
      },
      {
        icon: <HiClipboardDocument className="w-4 h-4" />,
        isDisabled: (item: IIngredient) => !item.promptText,
        onClick: handleCopy,
        tooltip: 'Copy Prompt',
        variant: ButtonVariant.GHOST,
      },
      {
        icon: <HiPencil className="w-4 h-4" />,
        onClick: handleEditIngredient,
        tooltip: 'Edit',
        variant: ButtonVariant.DEFAULT,
      },
    ];

    if (categoryType !== IngredientCategory.MUSIC) {
      baseActions.splice(1, 0, {
        icon: <HiInformationCircle className="w-4 h-4" />,
        onClick: handleSeeDetails,
        tooltip: 'View Ingredient',
        variant: ButtonVariant.GHOST,
      });
    }

    if (categoryType === IngredientCategory.IMAGE) {
      baseActions.splice(3, 0, {
        icon: <HiVideoCamera className="w-4 h-4" />,
        isDisabled: (item: IIngredient) =>
          item.status === IngredientStatus.PROCESSING,
        onClick: handleConvertImageToVideo,
        tooltip: 'Set as Video Reference',
        variant: ButtonVariant.SECONDARY,
      });
    }

    return baseActions;
  }, [
    categoryType,
    handleToggleFavorite,
    handleCopy,
    handleEditIngredient,
    handleSeeDetails,
    handleConvertImageToVideo,
  ]);

  return { actions };
}
