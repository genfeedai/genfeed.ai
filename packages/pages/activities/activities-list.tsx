'use client';

import {
  ActivityKey,
  ActivitySource,
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  Platform,
} from '@genfeedai/enums';
import type { IActivity, IIngredient } from '@genfeedai/interfaces';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useActivities } from '@hooks/data/activities/use-activities/use-activities';
import type { ActivitiesListProps } from '@props/content/activities.props';
import type { TableAction } from '@props/ui/display/table.props';
import { useIngredientOverlay } from '@providers/global-modals/global-modals.provider';
import { EnvironmentService } from '@services/core/environment.service';
import Button from '@ui/buttons/base/Button';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  HiArrowTopRightOnSquare,
  HiEnvelope,
  HiEnvelopeOpen,
  HiEye,
  HiFilm,
  HiOutlineClipboardDocumentList,
  HiPlay,
} from 'react-icons/hi2';

const BACKGROUND_TASK_KEYS = [
  ActivityKey.VIDEO_PROCESSING,
  ActivityKey.VIDEO_GENERATED,
  ActivityKey.VIDEO_COMPLETED,
  ActivityKey.VIDEO_FAILED,
  ActivityKey.IMAGE_PROCESSING,
  ActivityKey.IMAGE_GENERATED,
  ActivityKey.IMAGE_FAILED,
  ActivityKey.MUSIC_PROCESSING,
  ActivityKey.MUSIC_GENERATED,
  ActivityKey.MUSIC_FAILED,
  ActivityKey.POST_GENERATED,
  ActivityKey.POST_CREATED,
  ActivityKey.POST_SCHEDULED,
  ActivityKey.POST_PUBLISHED,
  ActivityKey.POST_FAILED,
  ActivityKey.MODELS_TRAINING_CREATED,
  ActivityKey.MODELS_TRAINING_COMPLETED,
  ActivityKey.MODELS_TRAINING_FAILED,
  ActivityKey.ARTICLE_PROCESSING,
  ActivityKey.ARTICLE_GENERATED,
  ActivityKey.ARTICLE_FAILED,
];

const CREDIT_ACTIVITY_KEYS = [
  ActivityKey.CREDITS_ADD,
  ActivityKey.CREDITS_REMOVE,
  ActivityKey.CREDITS_REMOVE_ALL,
  ActivityKey.CREDITS_RESET,
];

function isCreditActivity(key: string): boolean {
  return CREDIT_ACTIVITY_KEYS.includes(key as ActivityKey);
}

const ACTIVITY_SOURCE_LABELS: Record<string, string> = {
  [ActivitySource.BOT_GENERATION]: 'Agent conversation',
  [ActivitySource.IMAGE_GENERATION]: 'Image generation',
  [ActivitySource.VIDEO_GENERATION]: 'Video generation',
  [ActivitySource.MUSIC_GENERATION]: 'Music generation',
  [ActivitySource.ARTICLE_GENERATION]: 'Article generation',
  [ActivitySource.VOICE_GENERATION]: 'Voice generation',
  [ActivitySource.POST_GENERATION]: 'Post generation',
  [ActivitySource.PROMPT_ENHANCEMENT]: 'Prompt enhancement',
  [ActivitySource.PROMPT_REMIX]: 'Prompt remix',
  [ActivitySource.TWEET_REPLY]: 'Tweet reply',
  [ActivitySource.MODELS_TRAINING]: 'Model training',
  [ActivitySource.IMAGE_EVALUATION]: 'Image evaluation',
  [ActivitySource.VIDEO_EVALUATION]: 'Video evaluation',
  [ActivitySource.ARTICLE_EVALUATION]: 'Article evaluation',
  [ActivitySource.CONTENT_EVALUATION]: 'Content evaluation',
  [ActivitySource.VIDEO_REFRAME]: 'Video reframe',
  [ActivitySource.VIDEO_UPSCALE]: 'Video upscale',
  [ActivitySource.IMAGE_REFRAME]: 'Image reframe',
  [ActivitySource.IMAGE_UPSCALE]: 'Image upscale',
  [ActivitySource.PROMPT_CREATION]: 'Prompt creation',
  [ActivitySource.ARTICLE_ENHANCEMENT]: 'Article enhancement',
  [ActivitySource.ARTICLE_REMIX]: 'Article remix',
  [ActivitySource.POST_ENHANCEMENT]: 'Post enhancement',
  [ActivitySource.AVATAR_GENERATION]: 'Avatar generation',
  [ActivitySource.ASSET_GENERATION]: 'Asset generation',
  [ActivitySource.POST]: 'Content publish',
};

function getActivitySourceLabel(source: string): string | undefined {
  return ACTIVITY_SOURCE_LABELS[source];
}

function parseActivityValue(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isBackgroundTask(activity: IActivity): boolean {
  return BACKGROUND_TASK_KEYS.includes(activity.key as ActivityKey);
}

function getBackgroundTaskStatus(
  key: string,
): 'processing' | 'completed' | 'failed' | 'pending' {
  switch (key) {
    case ActivityKey.VIDEO_COMPLETED:
    case ActivityKey.VIDEO_GENERATED:
    case ActivityKey.IMAGE_GENERATED:
    case ActivityKey.MUSIC_GENERATED:
    case ActivityKey.POST_PUBLISHED:
    case ActivityKey.POST_GENERATED:
    case ActivityKey.MODELS_TRAINING_COMPLETED:
    case ActivityKey.ARTICLE_GENERATED:
      return 'completed';
    case ActivityKey.VIDEO_FAILED:
    case ActivityKey.IMAGE_FAILED:
    case ActivityKey.MUSIC_FAILED:
    case ActivityKey.POST_FAILED:
    case ActivityKey.MODELS_TRAINING_FAILED:
    case ActivityKey.ARTICLE_FAILED:
      return 'failed';
    case ActivityKey.VIDEO_PROCESSING:
    case ActivityKey.IMAGE_PROCESSING:
    case ActivityKey.MUSIC_PROCESSING:
    case ActivityKey.POST_CREATED:
    case ActivityKey.POST_SCHEDULED:
    case ActivityKey.MODELS_TRAINING_CREATED:
    case ActivityKey.ARTICLE_PROCESSING:
      return 'processing';
    default:
      return 'pending';
  }
}

function getResultTypeFromActivityKey(
  key: string,
): IngredientCategory | undefined {
  switch (key) {
    case ActivityKey.VIDEO_COMPLETED:
    case ActivityKey.VIDEO_GENERATED:
    case ActivityKey.VIDEO_PROCESSING:
    case ActivityKey.VIDEO_FAILED:
      return IngredientCategory.VIDEO;
    case ActivityKey.IMAGE_GENERATED:
    case ActivityKey.IMAGE_PROCESSING:
    case ActivityKey.IMAGE_FAILED:
      return IngredientCategory.IMAGE;
    case ActivityKey.MUSIC_GENERATED:
    case ActivityKey.MUSIC_PROCESSING:
    case ActivityKey.MUSIC_FAILED:
      return IngredientCategory.MUSIC;
    default:
      return undefined;
  }
}

function getActivityDescription(activity: IActivity): string {
  const key = activity.key as ActivityKey;

  switch (key) {
    // Image
    case ActivityKey.IMAGE_PROCESSING:
      return 'Generating an image...';
    case ActivityKey.IMAGE_GENERATED:
      return 'Generated an image';
    case ActivityKey.IMAGE_FAILED:
      return 'Failed to generate image';

    // Video
    case ActivityKey.VIDEO_PROCESSING:
      return 'Generating a video...';
    case ActivityKey.VIDEO_GENERATED:
    case ActivityKey.VIDEO_COMPLETED:
      return 'Generated a video';
    case ActivityKey.VIDEO_FAILED:
      return 'Failed to generate video';
    case ActivityKey.VIDEO_SCHEDULED:
      return 'Scheduled a video';

    // Music
    case ActivityKey.MUSIC_PROCESSING:
      return 'Generating music...';
    case ActivityKey.MUSIC_GENERATED:
      return 'Generated music';
    case ActivityKey.MUSIC_FAILED:
      return 'Failed to generate music';

    // Posts
    case ActivityKey.POST_GENERATED: {
      const parsed = parseActivityValue(activity.value);
      return (
        (parsed?.description as string) ||
        (parsed?.label as string) ||
        'Content is ready for review'
      );
    }
    case ActivityKey.POST_CREATED:
      return 'Created a post';
    case ActivityKey.POST_SCHEDULED:
      return 'Scheduled a post';
    case ActivityKey.POST_PUBLISHED:
      return 'Published a post';
    case ActivityKey.POST_FAILED:
      return 'Failed to publish post';

    // Articles
    case ActivityKey.ARTICLE_PROCESSING:
      return 'Generating an article...';
    case ActivityKey.ARTICLE_GENERATED:
      return 'Generated an article';
    case ActivityKey.ARTICLE_FAILED:
      return 'Failed to generate article';

    // Model Training
    case ActivityKey.MODELS_TRAINING_CREATED:
      return 'Started model training';
    case ActivityKey.MODELS_TRAINING_COMPLETED:
      return 'Completed model training';
    case ActivityKey.MODELS_TRAINING_FAILED:
      return 'Model training failed';

    // Credits
    case ActivityKey.CREDITS_ADD:
      return 'Credits added';
    case ActivityKey.CREDITS_REMOVE: {
      const sourceLabel = getActivitySourceLabel(activity.source);
      return sourceLabel || 'Credit deduction';
    }
    case ActivityKey.CREDITS_RESET:
      return 'Reset credits';
    case ActivityKey.CREDITS_REMOVE_ALL:
      return 'Removed all credits';

    // Social Integration
    case ActivityKey.SOCIAL_INTEGRATION_FAILED:
      return 'Social integration failed';
    case ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED:
      return 'Social account disconnected';

    default:
      return activity.label || activity.key;
  }
}

function parsePostActivityValue(
  value: string,
): { platform?: Platform; url?: string } | null {
  // Try JSON first (future format)
  try {
    const parsed = JSON.parse(value);
    if (parsed.platform && parsed.url) {
      return { platform: parsed.platform, url: parsed.url };
    }
  } catch {
    // Fall through to string parsing
  }

  // Parse string format: "Published to twitter: https://..."
  const match = value.match(/Published to (\w+):\s*(https?:\/\/\S+)/i);
  if (match) {
    const platformStr = match[1].toLowerCase();
    const url = match[2];
    // Map platform string to Platform enum
    const platformMap: Record<string, Platform> = {
      facebook: Platform.FACEBOOK,
      instagram: Platform.INSTAGRAM,
      linkedin: Platform.LINKEDIN,
      medium: Platform.MEDIUM,
      pinterest: Platform.PINTEREST,
      reddit: Platform.REDDIT,
      tiktok: Platform.TIKTOK,
      twitter: Platform.TWITTER,
      x: Platform.TWITTER,
      youtube: Platform.YOUTUBE,
    };
    return { platform: platformMap[platformStr], url };
  }

  return null;
}

export default function ActivitiesList({ scope }: ActivitiesListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);

  const {
    isLoading,
    isRefreshing,
    refresh,
    filteredActivities,
    markActivitiesAsRead,
    toggleActivityRead,
  } = useActivities({ limit: 20, page, scope });

  const { openIngredientOverlay } = useIngredientOverlay();
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);

  // Helper to get preview URL from populated ingredient
  const getPreviewUrl = useCallback(
    (
      ingredient: Record<string, unknown>,
      category: IngredientCategory,
    ): string | undefined => {
      if (!ingredient) {
        return undefined;
      }

      if (category === IngredientCategory.VIDEO) {
        if (ingredient.thumbnailUrl) {
          return ingredient.thumbnailUrl as string;
        }
        if (ingredient.id) {
          return `${EnvironmentService.cdnUrl}/ingredients/thumbnails/${ingredient.id}`;
        }
      } else if (category === IngredientCategory.IMAGE) {
        if (ingredient.ingredientUrl) {
          return ingredient.ingredientUrl as string;
        } else if (ingredient.thumbnailUrl) {
          return ingredient.thumbnailUrl as string;
        }
      }

      return undefined;
    },
    [],
  );

  const handleViewIngredient = useCallback(
    (ingredient: unknown) => {
      if (ingredient) {
        openIngredientOverlay(ingredient as IIngredient);
      }
    },
    [openIngredientOverlay],
  );

  // Status variant mapping
  const statusVariants: Record<
    string,
    'success' | 'error' | 'warning' | 'info'
  > = useMemo(
    () => ({
      completed: 'success',
      failed: 'error',
      pending: 'warning',
      processing: 'info',
    }),
    [],
  );

  const columns = useMemo(
    () => [
      {
        className: 'w-16',
        header: '',
        key: 'thumbnail',
        render: (a: IActivity) => {
          // For background tasks, use preview cache
          if (isBackgroundTask(a)) {
            const parsed = parseActivityValue(a.value);
            const resultId = parsed?.resultId as string | undefined;
            const status = getBackgroundTaskStatus(a.key);
            const parsedMediaUrl =
              typeof parsed?.mediaUrl === 'string'
                ? parsed.mediaUrl
                : undefined;

            if (resultId && status === 'completed') {
              // Get preview from populated ingredient data
              const resultType =
                (parsed?.resultType as IngredientCategory) ||
                getResultTypeFromActivityKey(a.key);
              const ingredient = (a as unknown as Record<string, unknown>)
                .ingredient;
              if (ingredient && resultType) {
                const previewUrl = getPreviewUrl(
                  ingredient as Record<string, unknown>,
                  resultType,
                );
                if (previewUrl) {
                  return (
                    <div className="group relative h-10 w-10 shrink-0 overflow-hidden bg-background">
                      <Image
                        src={previewUrl}
                        alt={a.label || 'Activity asset'}
                        fill
                        className="object-cover"
                        sizes="48px"
                        unoptimized
                      />
                      {resultType === IngredientCategory.VIDEO && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/50 transition-colors">
                          <HiPlay className="h-4 w-4 text-white group-hover:hidden" />
                          <HiEye className="h-5 w-5 text-white hidden group-hover:block" />
                        </div>
                      )}
                      {resultType !== IngredientCategory.VIDEO && (
                        <Button
                          withWrapper={false}
                          variant={ButtonVariant.UNSTYLED}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewIngredient(ingredient);
                          }}
                          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <HiEye className="h-5 w-5 text-white" />
                        </Button>
                      )}
                      {resultType === IngredientCategory.VIDEO && (
                        <Button
                          variant={ButtonVariant.UNSTYLED}
                          withWrapper={false}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewIngredient(ingredient);
                          }}
                          className="absolute inset-0"
                        />
                      )}
                    </div>
                  );
                }
              }
            }

            if (parsedMediaUrl && status === 'completed') {
              return (
                <div className="relative h-10 w-10 shrink-0 overflow-hidden bg-background">
                  <Image
                    src={parsedMediaUrl}
                    alt={a.label || 'Activity asset'}
                    fill
                    className="object-cover"
                    sizes="48px"
                    unoptimized
                  />
                </div>
              );
            }
          } else {
            // Fallback parsing for direct URL or JSON payload values.
            let assetInfo = null;
            try {
              if (a.value?.startsWith('{')) {
                assetInfo = JSON.parse(a.value);
              }
            } catch {
              if (
                a.value &&
                (a.value.includes('/images/') || a.value.includes('/videos/'))
              ) {
                const isVideo = a.value.includes('/videos/');
                assetInfo = {
                  type: isVideo ? 'video' : 'image',
                  url: a.value,
                };
              }
            }

            if (assetInfo?.url) {
              return (
                <div className="relative h-10 w-10 shrink-0 overflow-hidden bg-background">
                  <Image
                    src={assetInfo.url}
                    alt="Generated asset"
                    fill
                    className="object-cover"
                    sizes="48px"
                    unoptimized
                  />
                  {assetInfo.type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <HiPlay className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              );
            }
          }

          // Placeholder
          return (
            <div className="h-8 w-8 shrink-0 bg-background flex items-center justify-center">
              <HiFilm className="h-4 w-4 text-foreground/40" />
            </div>
          );
        },
      },
      {
        header: 'Description',
        key: 'label',
        render: (a: IActivity) => getActivityDescription(a),
      },
      {
        header: 'Status',
        key: 'status',
        render: (a: IActivity) => {
          let status: string;
          if (isBackgroundTask(a)) {
            status = getBackgroundTaskStatus(a.key);
          } else if (isCreditActivity(a.key)) {
            status = 'completed';
          } else {
            status = a.status || 'pending';
          }
          return (
            <Badge variant={statusVariants[status] || 'ghost'}>{status}</Badge>
          );
        },
      },
      {
        className: 'w-24',
        header: 'Cost',
        key: 'cost',
        render: (a: IActivity) => {
          if (!isCreditActivity(a.key)) return null;
          const parsed = parseActivityValue(a.value);
          const amount = (parsed?.value as string) || a.value;
          if (!amount) return null;
          return (
            <span className="text-sm text-foreground/70">{amount} credits</span>
          );
        },
      },
      {
        className: 'w-20',
        header: '',
        key: 'link',
        render: (a: IActivity) => {
          // Show external link for published posts
          if (a.key === ActivityKey.POST_PUBLISHED && a.value) {
            const postInfo = parsePostActivityValue(a.value);

            if (postInfo?.url && postInfo?.platform) {
              return (
                <PrimitiveButton
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.XS}
                >
                  <a
                    href={postInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {getPlatformIcon(postInfo.platform, 'w-4 h-4')}
                    <HiArrowTopRightOnSquare className="w-3 h-3" />
                  </a>
                </PrimitiveButton>
              );
            }
          }
          return null;
        },
      },
      {
        header: 'Details',
        key: 'value',
        render: (a: IActivity) => {
          // Only show value if it's not asset information and not a post link
          if (
            a.value &&
            !isCreditActivity(a.key) &&
            !a.value.startsWith('{') &&
            !a.value.includes('/images/') &&
            !a.value.includes('/videos/') &&
            !a.value.startsWith('Published to')
          ) {
            return (
              <span className="text-sm text-foreground/70">{a.value}</span>
            );
          }
          return null;
        },
      },
    ],
    [getPreviewUrl, handleViewIngredient, statusVariants[status]],
  );

  const actions: TableAction<IActivity>[] = useMemo(
    () => [
      {
        getClassName: (a: IActivity) => (a.isRead ? 'opacity-50' : ''),
        icon: (a: IActivity) =>
          a.isRead ? (
            <HiEnvelopeOpen className="w-4 h-4 text-foreground/50" />
          ) : (
            <HiEnvelope className="w-4 h-4 text-info" />
          ),
        onClick: (a: IActivity) => toggleActivityRead(a.id),
        tooltip: (a: IActivity) =>
          a.isRead ? 'Mark as unread' : 'Mark as read',
      },
    ],
    [toggleActivityRead],
  );

  const handleBulkMarkAsRead = async () => {
    if (selectedActivityIds.length > 0) {
      // Mark selected activities as read
      await markActivitiesAsRead(selectedActivityIds);
      setSelectedActivityIds([]);
    } else {
      // Mark all unread activities as read
      await markActivitiesAsRead();
    }
  };

  // Determine button state and copy
  const hasSelectedActivities = selectedActivityIds.length > 0;

  const getButtonLabel = () => {
    if (hasSelectedActivities) {
      return `Mark ${selectedActivityIds.length} as Read`;
    }

    return 'Mark All Read';
  };

  const handleRowClick = useCallback(
    (activity: IActivity) => {
      const parsed = parseActivityValue(activity.value);
      const href = typeof parsed?.href === 'string' ? parsed.href : undefined;

      if (href) {
        router.push(href);
      }
    },
    [router],
  );

  return (
    <Container
      label="Activities"
      description="Recent actions and system events."
      icon={HiOutlineClipboardDocumentList}
      right={
        <>
          <ButtonRefresh
            onClick={() => refresh()}
            isRefreshing={isRefreshing}
          />

          <Button
            label={getButtonLabel()}
            onClick={handleBulkMarkAsRead}
            variant={ButtonVariant.DEFAULT}
            isDisabled={isRefreshing || !hasSelectedActivities}
          />
        </>
      }
    >
      <AppTable<IActivity>
        items={filteredActivities}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getRowKey={(a: IActivity) => a.id}
        getRowClassName={(a: IActivity) => (a.isRead ? 'opacity-50' : '')}
        emptyLabel="No activity yet"
        selectable={true}
        selectedIds={selectedActivityIds}
        onSelectionChange={setSelectedActivityIds}
        getItemId={(a: IActivity) => a.id}
        onRowClick={handleRowClick}
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="activities" />
      </div>
    </Container>
  );
}
