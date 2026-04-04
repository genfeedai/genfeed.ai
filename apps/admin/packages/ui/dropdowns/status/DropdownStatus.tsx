'use client';

import {
  ArticleStatus,
  ButtonVariant,
  IngredientCategory,
  IngredientStatus,
  PostStatus,
} from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { StatusDropdownProps } from '@props/social/status-dropdown.props';
import { ArticlesService } from '@services/content/articles.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { GIFsService } from '@services/ingredients/gifs.service';
import { ImagesService } from '@services/ingredients/images.service';
import { VideosService } from '@services/ingredients/videos.service';
import Button from '@ui/buttons/base/Button';
import DropdownBase from '@ui/dropdowns/base/DropdownBase';
import { getStatusMeta } from '@ui-constants/status.constant';
import { useMemo, useState } from 'react';
import { HiArchiveBox, HiCheck, HiClock, HiXMark } from 'react-icons/hi2';

const ICON_CLASS = 'w-4 h-4';

// Status icon mapping by normalized status string
const STATUS_ICONS: Record<string, React.ReactNode> = {
  ARCHIVED: <HiArchiveBox className={ICON_CLASS} />,
  COMPLETED: <HiCheck className={ICON_CLASS} />,
  DRAFT: <HiClock className={ICON_CLASS} />,
  FAILED: <HiXMark className={ICON_CLASS} />,
  GENERATED: <HiCheck className={ICON_CLASS} />,
  PRIVATE: <HiClock className={ICON_CLASS} />,
  PROCESSING: <HiClock className={ICON_CLASS} />,
  PUBLIC: <HiCheck className={ICON_CLASS} />,
  PUBLISHED: <HiCheck className={ICON_CLASS} />,
  REJECTED: <HiXMark className={ICON_CLASS} />,
  SCHEDULED: <HiClock className={ICON_CLASS} />,
  UNLISTED: <HiClock className={ICON_CLASS} />,
  VALIDATED: <HiCheck className={ICON_CLASS} />,
};

const VARIANT_COLORS: Record<string, string> = {
  error: 'bg-error/20 text-error',
  info: 'bg-info/20 text-info',
  success: 'bg-success/20 text-success',
  warning: 'bg-warning/20 text-warning',
};

const DEFAULT_VARIANT_COLOR = 'bg-muted text-foreground';

// Pre-defined status option sets by entity type
const ARTICLE_STATUS_OPTIONS = [
  ArticleStatus.DRAFT,
  ArticleStatus.PUBLIC,
  ArticleStatus.ARCHIVED,
];

const POST_STATUS_OPTIONS = [
  PostStatus.DRAFT,
  PostStatus.SCHEDULED,
  PostStatus.PUBLIC,
  PostStatus.PRIVATE,
  PostStatus.UNLISTED,
];

const INGREDIENT_STATUS_OPTIONS = [
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
  IngredientStatus.ARCHIVED,
  IngredientStatus.REJECTED,
];

const INGREDIENT_PROCESSING_OPTIONS = [IngredientStatus.FAILED];

function getStatusIcon(statusValue: string): React.ReactNode {
  const statusStr = statusValue.toString().toUpperCase();
  return STATUS_ICONS[statusStr] ?? <HiCheck className={ICON_CLASS} />;
}

function getVariantColorClass(variant: string): string {
  const normalizedVariant = variant.toLowerCase();
  const matchedKey = Object.keys(VARIANT_COLORS).find((key) =>
    normalizedVariant.includes(key),
  );
  return matchedKey ? VARIANT_COLORS[matchedKey] : DEFAULT_VARIANT_COLOR;
}

/**
 * DropdownStatus Component
 *
 * Provides inline editing of status for articles, ingredients, and posts.
 * Automatically detects item type and uses the appropriate service.
 *
 * Status options:
 * - Articles: Draft, Published, Archived
 * - Ingredients: Completed, Validated, Archived, Rejected, Failed
 * - Posts: Draft, Scheduled, Public, Private, Unlisted (editable only)
 *
 * @param entity - The article, ingredient, or post to edit
 * @param className - Optional CSS classes
 * @param onStatusChange - Callback when status is updated with new status and updated item
 */
export default function DropdownStatus({
  entity,
  className = '',
  position = 'auto',
  onStatusChange,
}: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const notifications = NotificationsService.getInstance();

  // Determine item type: article, post, or ingredient
  const isArticle = 'slug' in entity && 'readingTime' in entity;
  const isPost = 'platform' in entity && 'scheduledDate' in entity;

  // Determine ingredient category (video or image)
  const ingredientCategory =
    !isArticle && !isPost && 'category' in entity
      ? (entity.category as IngredientCategory)
      : null;

  const isVideo = ingredientCategory === IngredientCategory.VIDEO;
  const isImage = ingredientCategory === IngredientCategory.IMAGE;
  const isGif = ingredientCategory === IngredientCategory.GIF;

  // Disable dropdown for FAILED status (ingredients only), but allow PROCESSING to show only failed option
  // For posts, show static badge for PROCESSING and FAILED statuses
  const isDisabled =
    entity.status === IngredientStatus.FAILED ||
    (isPost &&
      ((entity.status as unknown as PostStatus) === PostStatus.PROCESSING ||
        (entity.status as unknown as PostStatus) === PostStatus.FAILED));

  // Use appropriate service
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );

  const getGifsService = useAuthedService((token: string) =>
    GIFsService.getInstance(token),
  );

  const getArticlesService = useAuthedService((token: string) =>
    ArticlesService.getInstance(token),
  );

  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );

  // Status options based on current status and item type
  const statusOptions = useMemo(() => {
    if (isArticle) {
      return ARTICLE_STATUS_OPTIONS;
    }
    if (isPost) {
      return POST_STATUS_OPTIONS;
    }
    if (entity.status === IngredientStatus.PROCESSING) {
      return INGREDIENT_PROCESSING_OPTIONS;
    }
    return INGREDIENT_STATUS_OPTIONS;
  }, [entity.status, isArticle, isPost]);

  const handleChange = async (
    newStatus: IngredientStatus | ArticleStatus | PostStatus,
  ) => {
    try {
      let updatedItem;

      if (isArticle) {
        // Use articles service for both PATCH and GET
        const service = await getArticlesService();
        await service.patch(entity.id, {
          status: newStatus as ArticleStatus,
        });

        // Fetch complete article with all metadata
        updatedItem = await service.findOne(entity.id);
      } else if (isPost) {
        // Use posts service for both PATCH and GET
        const service = await getPostsService();
        await service.patch(entity.id, {
          status: newStatus as PostStatus,
        });

        // Fetch complete post with all metadata
        updatedItem = await service.findOne(entity.id);
      } else {
        // For ingredients: PATCH uses IngredientsService, GET uses specific service
        const ingredientsService = await getIngredientsService();
        await ingredientsService.patch(entity.id, {
          status: newStatus as IngredientStatus,
        });

        // Fetch complete ingredient with all metadata using specific service
        if (isVideo) {
          const videosService = await getVideosService();
          updatedItem = await videosService.findOne(entity.id);
        } else if (isImage) {
          const imagesService = await getImagesService();
          updatedItem = await imagesService.findOne(entity.id);
        } else if (isGif) {
          const gifsService = await getGifsService();
          updatedItem = await gifsService.findOne(entity.id);
        } else {
          // Fallback: use IngredientsService if category is unknown
          logger.error(
            'Unknown ingredient category in DropdownStatus, using IngredientsService',
            {
              category: ingredientCategory,
              entityId: entity.id,
            },
          );
          updatedItem = await ingredientsService.findOne(entity.id);
        }
      }

      // Emit the full updated item to parent
      onStatusChange?.(newStatus, updatedItem);

      // Show success notification
      const statusMeta = getStatusMeta(newStatus);
      const message = `Status updated to ${statusMeta.label}`;

      // For Failed status, use info notification instead of success
      if (newStatus === IngredientStatus.FAILED) {
        notifications.info(message);
      } else {
        notifications.success(`${message} successfully`);
      }
    } catch (error: unknown) {
      logger.error('Failed to update status', error);
      notifications.error('Failed to update status');
    } finally {
      setIsOpen(false);
    }
  };

  const status: IngredientStatus | ArticleStatus | PostStatus = entity.status as
    | IngredientStatus
    | ArticleStatus
    | PostStatus;

  const currentMeta = getStatusMeta(
    status as Parameters<typeof getStatusMeta>[0],
  );

  // Check if we should render icon-only mode (when className includes rounded-full)
  const isIconOnly = className.includes('rounded-full');

  // If disabled, just show the badge without dropdown functionality
  if (isDisabled) {
    return (
      <div className={className}>
        <div
          className={cn(
            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
            currentMeta.variant,
            'opacity-75 cursor-not-allowed',
          )}
        >
          {currentMeta.label}
        </div>
      </div>
    );
  }

  return (
    <DropdownBase
      className={className}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      position={position}
      usePortal={true}
      minWidth="180px"
      trigger={
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          aria-expanded={isOpen}
          ariaLabel={`Change Status - ${currentMeta.label}`}
          tooltip={`Status: ${currentMeta.label}`}
          tooltipPosition="top"
          className={
            isIconOnly
              ? cn(className)
              : cn(
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase',
                  'hover:opacity-80 transition-opacity cursor-pointer',
                  'border hover:border-current/20',
                  currentMeta.variant,
                )
          }
        >
          {isIconOnly ? getStatusIcon(entity.status) : currentMeta.label}
        </Button>
      }
    >
      {statusOptions.map((s) => {
        const meta = getStatusMeta(
          s as IngredientStatus | ArticleStatus | PostStatus,
        );
        const isActive = s === entity.status;
        const statusIcon = getStatusIcon(s);

        return (
          <Button
            key={s}
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={(e) => {
              e.stopPropagation();
              handleChange(s as IngredientStatus | ArticleStatus | PostStatus);
            }}
            className={cn(
              'flex items-center gap-3 w-full px-4 py-2.5 text-sm',
              'font-medium transition-all duration-150 cursor-pointer',
              'hover:bg-background/80 active:scale-[0.98]',
              isActive && 'bg-background/60',
            )}
          >
            {/* Status Icon */}
            <div
              className={cn(
                'flex-shrink-0 w-4 h-4 flex items-center justify-center',
                'transition-colors duration-150',
                isActive
                  ? getVariantColorClass(meta.variant)
                  : 'text-foreground/50',
              )}
            >
              {statusIcon}
            </div>

            {/* Status Label */}
            <span
              className={cn(
                'flex-1 text-left capitalize',
                isActive
                  ? 'text-foreground font-semibold'
                  : 'text-foreground/80',
              )}
            >
              {meta.label}
            </span>

            {/* Active Indicator */}
            {isActive && (
              <HiCheck
                size={18}
                className="flex-shrink-0 text-success"
                aria-hidden="true"
              />
            )}
          </Button>
        );
      })}
    </DropdownBase>
  );
}
