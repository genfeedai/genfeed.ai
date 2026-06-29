'use client';

import type { IEvaluation } from '@genfeedai/client/models';
import { PostStatus } from '@genfeedai/enums';
import { getBrowserTimezone } from '@genfeedai/helpers/formatting/timezone/timezone.helper';
import { useEvaluation } from '@genfeedai/hooks/ui/evaluation/use-evaluation/use-evaluation';
import type { IImage, IVideo } from '@genfeedai/interfaces';
import type { PostDetailSidebarProps } from '@genfeedai/props/components/post-detail-sidebar.props';
import {
  isImageIngredient,
  isVideoIngredient,
} from '@genfeedai/utils/media/ingredient-type.util';
import Card from '@ui/card/Card';
import EvaluationCard from '@ui/evaluation/card/EvaluationCard';
import SeoScorecard from '@ui/evaluation/seo-scorecard/SeoScorecard';
import {
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';
import { useMemo } from 'react';
import { HiBolt } from 'react-icons/hi2';
import PostSidebarAnalyticsCard from './PostSidebarAnalyticsCard';
import PostSidebarPlatformCard from './PostSidebarPlatformCard';
import PostSidebarReviewCard from './PostSidebarReviewCard';
import PostSidebarScheduleCard from './PostSidebarScheduleCard';

export default function PostDetailSidebar({
  post,
  credential,
  scheduleDraft,
  isSavingSchedule,
  isScheduleDirty,
  isScoringSeo = false,
  isSeoDirty = false,
  analyticsStats,
  reviewSummary,
  onScheduleChange,
  onScheduleSave,
  onScoreSeo,
  className = '',
}: PostDetailSidebarProps) {
  // Get browser timezone for consistent date display
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const contentId = post?.id ?? '';

  const {
    evaluation: newEvaluation,
    isEvaluating,
    evaluate,
  } = useEvaluation({
    autoFetch: false,
    contentId,
    contentType: 'post',
  });

  if (!post) {
    return null;
  }

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

  return (
    <div className={`space-y-4 lg:sticky lg:top-4 lg:self-start ${className}`}>
      <PostSidebarPlatformCard post={post} credential={credential} />

      {isPublished && analyticsStats.length > 0 && (
        <PostSidebarAnalyticsCard analyticsStats={analyticsStats} />
      )}

      {hasReviewLineage && reviewSummary && (
        <PostSidebarReviewCard
          reviewSummary={reviewSummary}
          browserTimezone={browserTimezone}
        />
      )}

      {!isPublished && (
        <PostSidebarScheduleCard
          scheduleDraft={scheduleDraft}
          isSavingSchedule={isSavingSchedule}
          isScheduleDirty={isScheduleDirty}
          browserTimezone={browserTimezone}
          onScheduleChange={onScheduleChange}
          onScheduleSave={onScheduleSave}
        />
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

      <SeoScorecard
        score={post.seoScore}
        scorecard={post.seoBreakdown}
        contentTypeLabel="post"
        isScoring={isScoringSeo}
        hasUnsavedChanges={isSeoDirty}
        onScore={onScoreSeo}
      />

      {isPublished && post.ingredients?.length > 0 && (
        <Card>
          <div className="flex items-center gap-2">
            <HiBolt className="size-4 text-warning" />
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
