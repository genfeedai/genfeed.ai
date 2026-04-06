'use client';

import type { IEvaluation } from '@genfeedai/client/models';
import {
  ButtonVariant,
  CredentialPlatform,
  PostStatus,
} from '@genfeedai/enums';
import type { IImage, IVideo } from '@genfeedai/interfaces';
import { getBrowserTimezone } from '@helpers/formatting/timezone/timezone.helper';
import { useEvaluation } from '@hooks/ui/evaluation/use-evaluation/use-evaluation';
import type { PostDetailSidebarProps } from '@props/components/post-detail-sidebar.props';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import EvaluationCard from '@ui/evaluation/card/EvaluationCard';
import FormDateTimePicker from '@ui/forms/pickers/date-time-picker/form-date-time-picker/FormDateTimePicker';
import {
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';
import {
  isImageIngredient,
  isVideoIngredient,
} from '@utils/media/ingredient-type.util';
import Link from 'next/link';
import { useMemo } from 'react';
import type { IconType } from 'react-icons';
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaReddit,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';
import { HiArrowTopRightOnSquare, HiBolt } from 'react-icons/hi2';

const platformIconMap: Partial<Record<CredentialPlatform, IconType>> = {
  [CredentialPlatform.TIKTOK]: FaTiktok,
  [CredentialPlatform.YOUTUBE]: FaYoutube,
  [CredentialPlatform.TWITTER]: FaXTwitter,
  [CredentialPlatform.INSTAGRAM]: FaInstagram,
  [CredentialPlatform.FACEBOOK]: FaFacebook,
  [CredentialPlatform.LINKEDIN]: FaLinkedin,
  [CredentialPlatform.REDDIT]: FaReddit,
};

const getPlatformLabel = (platform?: string) =>
  platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'Unknown';

export default function PostDetailSidebar({
  post,
  credential,
  scheduleDraft,
  isSavingSchedule,
  isScheduleDirty,
  analyticsStats,
  reviewSummary,
  onScheduleChange,
  onScheduleSave,
  className = '',
}: PostDetailSidebarProps) {
  // Get browser timezone for consistent date display
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);

  // Early return if post is null
  if (!post) {
    return null;
  }

  // Hook for AI quality evaluation (autoFetch disabled - evaluation comes with post)
  const {
    evaluation: newEvaluation,
    isEvaluating,
    evaluate,
  } = useEvaluation({
    autoFetch: false,
    contentId: post.id,
    contentType: 'post',
  });

  // Use evaluation from post (fetched with post) or newly created evaluation from hook
  // Cast to client model type for compatibility with EvaluationCard
  const evaluation: IEvaluation | undefined =
    newEvaluation ?? (post.evaluation as IEvaluation | undefined);

  const isPublished =
    Boolean(post.publicationDate) || post.status === PostStatus.PUBLIC;
  const hasReviewLineage =
    Boolean(reviewSummary?.reviewBatchId) ||
    Boolean(reviewSummary?.reviewItemId) ||
    Boolean(reviewSummary?.sourceWorkflowName) ||
    Boolean(reviewSummary?.sourceActionId) ||
    Boolean(reviewSummary?.generationId);
  const reviewEvents = [...(reviewSummary?.reviewEvents ?? [])].sort(
    (left, right) => right.reviewedAt.localeCompare(left.reviewedAt),
  );

  const formatReviewDecision = (
    decision?: 'approved' | 'rejected' | 'request_changes',
  ) => {
    if (decision === 'request_changes') {
      return 'Changes requested';
    }

    if (decision) {
      return decision.charAt(0).toUpperCase() + decision.slice(1);
    }

    return 'Not reviewed';
  };

  return (
    <div className={`space-y-4 lg:sticky lg:top-4 lg:self-start ${className}`}>
      <Card>
        <div className="flex items-center gap-3 w-full">
          {post.platform && platformIconMap[post.platform] ? (
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-background">
              {(() => {
                const Icon =
                  platformIconMap[post.platform as CredentialPlatform]!;
                return <Icon className="h-6 w-6" />;
              })()}
            </span>
          ) : null}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">
              {getPlatformLabel(post.platform)}
            </p>

            {credential?.externalHandle && (
              <p className="text-lg text-foreground/60 truncate">
                @{credential.externalHandle}
              </p>
            )}
          </div>

          <div className="flex items-center ml-auto">
            <Badge status={post.status} className="text-xs">
              {post.status}
            </Badge>
          </div>
        </div>

        {post.url && (
          <Link
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 border border-input bg-secondary/50 px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-full"
          >
            <HiArrowTopRightOnSquare className="w-4 h-4" />
            <span>Open on platform</span>
          </Link>
        )}
      </Card>

      {isPublished && analyticsStats.length > 0 && (
        <Card>
          <div className="grid grid-cols-2 gap-3">
            {analyticsStats.map((stat) => {
              // Map accent colors to background colors like overview cards
              const getIconBgClass = () => {
                if (stat.accent.includes('primary')) {
                  return 'bg-green-100 text-green-600';
                }
                if (stat.accent.includes('rose')) {
                  return 'bg-red-100 text-red-600';
                }
                if (stat.accent.includes('secondary')) {
                  return 'bg-purple-100 text-purple-600';
                }
                if (stat.accent.includes('warning')) {
                  return 'bg-orange-100 text-orange-600';
                }
                if (stat.accent.includes('success')) {
                  return 'bg-teal-100 text-teal-600';
                }
                return 'bg-background text-foreground';
              };

              return (
                <div key={stat.label} className="flex items-center gap-3">
                  <div className={`flex-shrink-0 p-2 ${getIconBgClass()}`}>
                    <stat.icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground/60 mb-0.5">
                      {stat.label}
                    </p>
                    <p className="text-xl font-bold text-foreground">
                      {stat.value}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {hasReviewLineage && (
        <Card>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg">Lineage</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-foreground/60">Workflow</span>
                  <span className="text-right">
                    {reviewSummary?.sourceWorkflowName ??
                      reviewSummary?.sourceWorkflowId ??
                      'Not recorded'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-foreground/60">Action</span>
                  <span className="text-right">
                    {reviewSummary?.sourceActionId ?? 'Not recorded'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-foreground/60">Generation</span>
                  <span className="text-right">
                    {reviewSummary?.generationId ?? 'Not linked'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-foreground/60">Prompt</span>
                  <span className="line-clamp-2 text-right">
                    {reviewSummary?.promptUsed ?? 'Not recorded'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-foreground/60">Review batch</span>
                  <span className="text-right">
                    {reviewSummary?.reviewBatchId ?? 'Not linked'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-foreground/60">Review item</span>
                  <span className="text-right">
                    {reviewSummary?.reviewItemId ?? 'Not linked'}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-semibold text-lg">Review State</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-foreground/60">Decision</span>
                  <span className="text-right">
                    {formatReviewDecision(reviewSummary?.reviewDecision)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-foreground/60">Reviewed</span>
                  <span className="text-right">
                    {reviewSummary?.reviewedAt
                      ? new Date(reviewSummary.reviewedAt).toLocaleString(
                          undefined,
                          { timeZone: browserTimezone },
                        )
                      : 'Not reviewed'}
                  </span>
                </div>
              </div>
              {reviewSummary?.reviewFeedback && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/75">
                  {reviewSummary.reviewFeedback}
                </p>
              )}

              {reviewEvents.length > 0 && (
                <div className="mt-4 space-y-3">
                  {reviewEvents.map((event, index) => (
                    <div
                      key={`${event.reviewedAt}-${event.decision}-${index}`}
                      className="rounded-lg border border-border bg-background/40 p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <span className="font-medium">
                          {formatReviewDecision(event.decision)}
                        </span>
                        <span className="text-right text-foreground/60">
                          {new Date(event.reviewedAt).toLocaleString(
                            undefined,
                            {
                              timeZone: browserTimezone,
                            },
                          )}
                        </span>
                      </div>
                      {event.feedback && (
                        <p className="mt-2 whitespace-pre-wrap text-foreground/75">
                          {event.feedback}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {!isPublished && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-lg">Scheduled Time</h3>
          </div>

          <FormDateTimePicker
            value={scheduleDraft}
            timezone={browserTimezone}
            onChange={(value: Date | null) =>
              onScheduleChange(value ? value.toISOString() : '')
            }
          />

          <Button
            label={isSavingSchedule ? 'Saving...' : 'Schedule'}
            variant={ButtonVariant.DEFAULT}
            className="w-full"
            isLoading={isSavingSchedule}
            isDisabled={!isScheduleDirty || !scheduleDraft || isSavingSchedule}
            onClick={onScheduleSave}
          />
        </Card>
      )}

      <EvaluationCard
        contentId={post.id}
        contentType="post"
        evaluation={evaluation ?? undefined}
        isEvaluating={isEvaluating}
        isPublished={isPublished}
        onEvaluate={async () => {
          await evaluate();
        }}
      />

      {isPublished && post.ingredients?.length > 0 && (
        <Card>
          <div className="flex items-center gap-2">
            <HiBolt className="w-4 h-4 text-warning" />
            <h3 className="font-semibold text-lg">
              Ingredients ({post.ingredients?.length || 0})
            </h3>
          </div>

          {post.ingredients && post.ingredients.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {post.ingredients.map((ing) => {
                if (isImageIngredient(ing)) {
                  return (
                    <div key={ing.id}>
                      <LazyMasonryImage
                        image={ing as IImage}
                        isActionsEnabled={false}
                        isContainerHovered={true}
                      />
                    </div>
                  );
                }

                if (isVideoIngredient(ing)) {
                  return (
                    <div key={ing.id}>
                      <LazyMasonryVideo
                        video={ing as IVideo}
                        isActionsEnabled={false}
                        isContainerHovered={true}
                      />
                    </div>
                  );
                }

                return null;
              })}
            </div>
          ) : (
            <p className="text-sm text-foreground/70">
              Ingredient details are unavailable for this post.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
