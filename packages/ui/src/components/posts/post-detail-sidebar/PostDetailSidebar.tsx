'use client';

import type { IEvaluation } from '@genfeedai/client/models';
import {
  CredentialPlatform,
  PostCategory,
  Status,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IImage, IVideo } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getBrowserTimezone } from '@genfeedai/helpers/formatting/timezone/timezone.helper';
import { useEvaluation } from '@genfeedai/hooks/ui/evaluation/use-evaluation/use-evaluation';
import type { PostDetailSidebarProps } from '@genfeedai/props/components/post-detail-sidebar.props';
import {
  isImageIngredient,
  isVideoIngredient,
} from '@genfeedai/utils/media/ingredient-type.util';
import EvaluationCard from '@ui/evaluation/card/EvaluationCard';
import SeoScorecard from '@ui/evaluation/seo-scorecard/SeoScorecard';
import {
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';
import Tabs from '@ui/navigation/tabs/Tabs';
import TikTokPublishingSettings from '@ui/posts/tiktok-publishing/TikTokPublishingSettings';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import InspectorSection from './InspectorSection';
import PostSidebarDestination from './PostSidebarDestination';
import PostSidebarLineage, { getReviewDecisionKey } from './PostSidebarLineage';
import PostSidebarWhenDock from './PostSidebarWhenDock';

type InspectorTab = 'details' | 'preview';

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
  preview,
  onScheduleChange,
  onScheduleSave,
  onPublishNow,
  onPublishViaTikTokApp,
  onScoreSeo,
  onSettingsSaved,
  onTikTokReadinessChange,
  className = '',
}: PostDetailSidebarProps) {
  const translate = useTranslations('ui.postDetailInspector');
  // Get browser timezone for consistent date display
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const contentId = post?.id ?? '';
  const [activeTab, setActiveTab] = useState<InspectorTab>('details');
  const [isTikTokReady, setIsTikTokReady] = useState(false);

  const {
    evaluation: newEvaluation,
    isEvaluating,
    evaluate,
  } = useEvaluation({
    autoFetch: false,
    contentId,
    contentType: 'post',
  });

  // Track readiness locally (the dock gates publishing on it) and forward it
  // to the page, which guards the publish handlers with the same signal.
  const handleTikTokReadinessChange = useCallback(
    (isReady: boolean) => {
      setIsTikTokReady(isReady);
      onTikTokReadinessChange?.(isReady);
    },
    [onTikTokReadinessChange],
  );

  if (!post) {
    return null;
  }

  // Use evaluation from post (fetched with post) or newly created evaluation from hook
  // Cast to client model type for compatibility with EvaluationCard
  const evaluation: IEvaluation | undefined =
    newEvaluation ?? (post.evaluation as IEvaluation | undefined);

  const isPublished =
    Boolean(post.publicationDate) ||
    post.targetExecutionState === TargetExecutionState.PUBLISHED;
  const hasReviewLineage =
    Boolean(reviewSummary?.reviewTurboRunId) ||
    Boolean(reviewSummary?.reviewItemId) ||
    Boolean(reviewSummary?.sourceWorkflowName) ||
    Boolean(reviewSummary?.sourceActionId) ||
    Boolean(reviewSummary?.generationId);
  const isTikTok = post.platform === CredentialPlatform.TIKTOK;
  const canPublishViaTikTokApp =
    Boolean(onPublishViaTikTokApp) &&
    isTikTok &&
    (post.category === PostCategory.VIDEO ||
      post.category === PostCategory.REEL) &&
    post.ingredients.length > 0;

  const evaluationScore =
    evaluation?.data?.status === Status.COMPLETED
      ? evaluation.data.overallScore
      : undefined;
  const checksSummary = [
    typeof evaluationScore === 'number'
      ? translate('qualitySummary', { score: evaluationScore })
      : null,
    typeof post.seoScore === 'number'
      ? translate('seoSummary', { score: Math.round(post.seoScore) })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const firstStat = analyticsStats[0];
  const isPreviewActive = Boolean(preview) && activeTab === 'preview';
  const inspectorTabs = [
    { id: 'details', label: translate('tabs.details') },
    { id: 'preview', label: translate('tabs.preview') },
  ];

  return (
    <div className={cn('flex flex-col', className)}>
      {preview ? (
        <Tabs
          ariaLabel={translate('viewAria')}
          items={inspectorTabs}
          activeTab={activeTab}
          onTabChange={(tabId) => setActiveTab(tabId as InspectorTab)}
          fullWidth={false}
          className="justify-start pb-3"
          listClassName="ml-0"
        />
      ) : null}

      {isPreviewActive ? (
        <div data-testid="post-inspector-preview">{preview}</div>
      ) : null}

      {/* Stays mounted behind the Preview tab: unmounting TikTok settings would
          report "not ready" and block publishing from the dock. */}
      <div
        className={cn('flex flex-col', isPreviewActive && 'hidden')}
        data-testid="post-inspector-details"
      >
        <PostSidebarDestination
          post={post}
          credential={credential}
          browserTimezone={browserTimezone}
          isPublished={isPublished}
        />

        {!isPublished && isTikTok ? (
          <InspectorSection
            title={translate('tiktokSettings')}
            summary={
              isTikTokReady
                ? translate('tiktokReady')
                : translate('tiktokNeedsSettings')
            }
            isDefaultOpen
            isMountedWhenClosed
            testId="inspector-tiktok"
          >
            <TikTokPublishingSettings
              key={post.id}
              post={post}
              isEmbedded
              onSaved={onSettingsSaved}
              onReadinessChange={handleTikTokReadinessChange}
            />
          </InspectorSection>
        ) : null}

        {isPublished && firstStat ? (
          <InspectorSection
            title={translate('performance')}
            summary={`${firstStat.value} ${firstStat.label}`}
            isDefaultOpen
            testId="inspector-performance"
          >
            <div className="grid grid-cols-2 gap-3">
              {analyticsStats.map((stat) => (
                <div key={stat.label} className="flex items-center gap-3">
                  <div className="flex-shrink-0 bg-secondary p-2 text-foreground">
                    <stat.icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="mb-0.5 text-xs text-foreground/60">
                      {stat.label}
                    </p>
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      {stat.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </InspectorSection>
        ) : null}

        {hasReviewLineage && reviewSummary ? (
          <InspectorSection
            title={translate('lineage')}
            summary={
              reviewSummary.reviewDecision
                ? translate(
                    `decisions.${getReviewDecisionKey(reviewSummary.reviewDecision)}`,
                  )
                : (reviewSummary.sourceWorkflowName ?? undefined)
            }
            testId="inspector-lineage"
          >
            <PostSidebarLineage
              reviewSummary={reviewSummary}
              browserTimezone={browserTimezone}
            />
          </InspectorSection>
        ) : null}

        <InspectorSection
          title={translate('checks')}
          summary={checksSummary || translate('notRun')}
          isDefaultOpen
          testId="inspector-checks"
        >
          <div className="flex flex-col gap-4">
            <EvaluationCard
              variant="embedded"
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
              variant="embedded"
              score={post.seoScore}
              scorecard={post.seoBreakdown}
              contentTypeLabel={translate('postLabel')}
              isScoring={isScoringSeo}
              hasUnsavedChanges={isSeoDirty}
              onScore={onScoreSeo}
            />
          </div>
        </InspectorSection>

        {isPublished && post.ingredients?.length > 0 ? (
          <InspectorSection
            title={translate('ingredients')}
            summary={String(post.ingredients.length)}
            testId="inspector-ingredients"
          >
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
          </InspectorSection>
        ) : null}
      </div>

      <PostSidebarWhenDock
        post={post}
        scheduleDraft={scheduleDraft}
        isSavingSchedule={isSavingSchedule}
        isScheduleDirty={isScheduleDirty}
        isPublished={isPublished}
        browserTimezone={browserTimezone}
        isTikTokReady={isTikTokReady}
        onScheduleChange={onScheduleChange}
        onScheduleSave={onScheduleSave}
        onPublishNow={onPublishNow}
        {...(canPublishViaTikTokApp ? { onPublishViaTikTokApp } : {})}
      />
    </div>
  );
}
