'use client';

import {
  ArticleStatus,
  IngredientCategory,
  IngredientStatus,
  PostStatus,
  StatusDomain,
} from '@genfeedai/contracts';
import { mapPostStatusToCanonicalWrite } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { LIBRARY_ASSETS_REFRESH_EVENT } from '@genfeedai/contracts/constants';
import type {
  IArticle,
  IIngredient,
  IPost,
} from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { StatusDropdownProps } from '@genfeedai/props/social/status-dropdown.props';
import { ArticlesService } from '@genfeedai/services/content/articles.service';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { PostsService } from '@genfeedai/services/content/posts.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { GIFsService } from '@genfeedai/services/ingredients/gifs.service';
import { ImagesService } from '@genfeedai/services/ingredients/images.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import GenerationStatus from '@ui/feedback/generation-status/GenerationStatus';
import {
  type BadgeVariant,
  badgeVariants,
} from '@ui/primitives/badge.variants';
import { OptionSelect } from '@ui/primitives/option-select';
import { getStatusMeta } from '@ui-constants/status.constant';
import { Archive, Check, Clock, X } from 'lucide-react';
import { useMemo, useState } from 'react';

const ICON_CLASS = 'size-4';

// Status icon mapping by normalized status string
const STATUS_ICONS: Record<string, React.ReactNode> = {
  ARCHIVED: <Archive className={ICON_CLASS} />,
  COMPLETED: <Check className={ICON_CLASS} />,
  DRAFT: <Clock className={ICON_CLASS} />,
  FAILED: <X className={ICON_CLASS} />,
  GENERATED: <Check className={ICON_CLASS} />,
  PENDING: <Clock className={ICON_CLASS} />,
  PRIVATE: <Clock className={ICON_CLASS} />,
  PROCESSING: <Clock className={ICON_CLASS} />,
  PUBLIC: <Check className={ICON_CLASS} />,
  PUBLISHED: <Check className={ICON_CLASS} />,
  REJECTED: <X className={ICON_CLASS} />,
  SCHEDULED: <Clock className={ICON_CLASS} />,
  UNLISTED: <Clock className={ICON_CLASS} />,
  VALIDATED: <Check className={ICON_CLASS} />,
};

// Pre-defined status option sets by entity type
const ARTICLE_STATUS_OPTIONS = [
  ArticleStatus.DRAFT,
  ArticleStatus.PUBLISHED,
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
  return STATUS_ICONS[statusStr] ?? <Check className={ICON_CLASS} />;
}

const STATUS_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  destructive: 'destructive',
  error: 'destructive',
  ghost: 'secondary',
  info: 'info',
  outline: 'outline',
  secondary: 'secondary',
  success: 'success',
  warning: 'warning',
};

function getStatusBadgeVariant(variant: string): BadgeVariant {
  return STATUS_BADGE_VARIANTS[variant.toLowerCase()] ?? 'secondary';
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
  isStacked = false,
  onStatusChange,
}: StatusDropdownProps) {
  const [isCancelling, setIsCancelling] = useState(false);

  const notifications = NotificationsService.getInstance();

  // Determine item type: article, post, or ingredient
  const isArticle = 'slug' in entity && 'readingTime' in entity;
  const isPost = 'platform' in entity && 'scheduledDate' in entity;

  // Determine ingredient category (video or image)
  const ingredientCategory =
    !isArticle && !isPost && 'category' in entity
      ? (entity.category as IngredientCategory)
      : null;

  // Status labels are resolved per domain — the same string means different
  // things to an article, a post, and an ingredient.
  const statusDomain = isArticle
    ? StatusDomain.ARTICLE
    : isPost
      ? StatusDomain.POST
      : StatusDomain.INGREDIENT;

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
      let updatedItem: IIngredient | IArticle | IPost | undefined;

      if (isArticle) {
        // Use articles service for both PATCH and GET
        const service = await getArticlesService();
        await service.patch(entity.id, {
          status: newStatus as ArticleStatus,
        });

        updatedItem = (await service.findOne(entity.id)) as
          | IArticle
          | undefined;
      } else if (isPost) {
        // Use posts service for both PATCH and GET
        const service = await getPostsService();
        await service.patch(
          entity.id,
          mapPostStatusToCanonicalWrite(newStatus as PostStatus),
        );

        updatedItem = (await service.findOne(entity.id)) as IPost | undefined;
      } else {
        // For ingredients: PATCH uses IngredientsService, GET uses specific service
        const ingredientsService = await getIngredientsService();
        await ingredientsService.patch(entity.id, {
          status: newStatus as IngredientStatus,
        });

        // Fetch complete ingredient with all metadata using specific service
        if (isVideo) {
          const videosService = await getVideosService();
          updatedItem = (await videosService.findOne(entity.id)) as
            | IIngredient
            | undefined;
        } else if (isImage) {
          const imagesService = await getImagesService();
          updatedItem = (await imagesService.findOne(entity.id)) as
            | IIngredient
            | undefined;
        } else if (isGif) {
          const gifsService = await getGifsService();
          updatedItem = (await gifsService.findOne(entity.id)) as
            | IIngredient
            | undefined;
        } else {
          // Fallback: use IngredientsService if category is unknown
          logger.error(
            'Unknown ingredient category in DropdownStatus, using IngredientsService',
            {
              category: ingredientCategory,
              entityId: entity.id,
            },
          );
          updatedItem = (await ingredientsService.findOne(entity.id)) as
            | IIngredient
            | undefined;
        }
      }

      // Emit the full updated item to parent
      onStatusChange?.(newStatus, updatedItem);
      if (!isArticle && !isPost) {
        window.dispatchEvent(new Event(LIBRARY_ASSETS_REFRESH_EVENT));
      }

      // Show success notification
      const statusMeta = getStatusMeta(newStatus, statusDomain);
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
    }
  };

  const status: IngredientStatus | ArticleStatus | PostStatus = entity.status as
    | IngredientStatus
    | ArticleStatus
    | PostStatus;

  const currentMeta = getStatusMeta(
    status as Parameters<typeof getStatusMeta>[0],
    statusDomain,
  );

  // A status the editor cannot pick (it is not in the list) still shows on the control.
  const selectableStatuses = (statusOptions as string[]).includes(
    String(entity.status),
  )
    ? statusOptions
    : [entity.status, ...statusOptions];

  // Check if we should render icon-only mode (when className includes rounded-full)
  const isIconOnly = className.includes('rounded-full');

  if (String(entity.status).toUpperCase() === 'PROCESSING') {
    const cancel = async () => {
      setIsCancelling(true);
      try {
        const service = await getIngredientsService();
        const updated = await service.cancelGeneration(entity.id);
        onStatusChange?.(updated.status, updated);
      } catch (error) {
        logger.error('Could not cancel generation', error);
        notifications.error('Could not cancel generation');
      } finally {
        setIsCancelling(false);
      }
    };
    return (
      <GenerationStatus
        status="generating"
        assetLabel={
          isArticle
            ? 'article'
            : isPost
              ? 'post'
              : ingredientCategory?.toLowerCase()
        }
        label={isPost || isArticle ? currentMeta.label : undefined}
        compact
        isStacked={isStacked}
        className={className}
        onCancel={!isArticle && !isPost ? () => void cancel() : undefined}
        isCancelling={isCancelling}
      />
    );
  }

  // If disabled, just show the badge without dropdown functionality
  if (isDisabled) {
    return (
      <div className={className}>
        <div
          className={cn(
            badgeVariants({
              variant: getStatusBadgeVariant(currentMeta.variant),
            }),
            'border opacity-75 cursor-not-allowed',
          )}
        >
          {currentMeta.label}
        </div>
      </div>
    );
  }

  return (
    <OptionSelect
      ariaLabel={`Change Status - ${currentMeta.label}`}
      className={
        isIconOnly
          ? className
          : cn(
              badgeVariants({
                variant: getStatusBadgeVariant(currentMeta.variant),
              }),
              'h-auto w-auto cursor-pointer border px-2.5 py-0.5 transition-opacity hover:opacity-80',
              className,
            )
      }
      icon={isIconOnly ? getStatusIcon(entity.status) : undefined}
      isIconOnly={isIconOnly}
      isIndicatorHidden
      onValueChange={(next) =>
        void handleChange(next as IngredientStatus | ArticleStatus | PostStatus)
      }
      options={selectableStatuses.map((option) => ({
        icon: getStatusIcon(option),
        label: getStatusMeta(
          option as IngredientStatus | ArticleStatus | PostStatus,
          statusDomain,
        ).label,
        value: option,
      }))}
      value={String(entity.status)}
    />
  );
}
