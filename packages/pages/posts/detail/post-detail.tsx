'use client';

import {
  AlertCategory,
  normalizeReviewDecision,
  type PageScope,
  PostRepurposeMode,
  PostStatus,
} from '@genfeedai/enums';
import { getPublisherPostHref } from '@helpers/content/posts.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { usePostDetail } from '@hooks/pages/use-post-detail/use-post-detail';
import PostDetailContent from '@pages/posts/detail/components/PostDetailContent';
import PostDetailHeader from '@pages/posts/detail/components/PostDetailHeader';
import type { PostReviewSummary } from '@props/components/post-detail-sidebar.props';
import { usePostRepurposeModal } from '@providers/global-modals/global-modals.provider';
import Card from '@ui/card/Card';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Alert from '@ui/feedback/alert/Alert';
import EngagementPreview from '@ui/posts/engagement-preview/EngagementPreview';
import PostDetailSidebar from '@ui/posts/post-detail-sidebar/PostDetailSidebar';
import {
  buildSourcePostVariationsHref,
  isSourcePostVariationPlatform,
} from '@utils/url/desktop-loop-url.util';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

export interface PostDetailProps {
  postId: string;
  scope: PageScope;
  presentation?: 'page' | 'overlay';
  /**
   * When set, sidebar meta (schedule, quality, SEO, …) is handed to the host
   * (e.g. workspace Context rail) instead of rendering inline beside content.
   */
  renderContextSidebar?: (
    sidebar: ReactNode,
    contextLabel: string,
  ) => ReactNode;
}

export default function PostDetail({
  postId,
  scope,
  presentation = 'page',
  renderContextSidebar,
}: PostDetailProps) {
  const router = useRouter();
  const { href } = useOrgUrl();
  const { openPostRepurposeModal } = usePostRepurposeModal();
  const hookData = usePostDetail({ postId, scope });
  const translate = useTranslations('pages.posts.detail');

  const {
    post,
    sortedChildren,
    isLoading,
    error,
    credential,
    viewMode,
    focusedPostId,
    labelDraft,
    descriptionDraft,
    childDescriptions,
    scheduleDraft,
    selectedIngredients,
    isSavingDescription,
    isSavingSchedule,
    isSavingIngredients,
    enhancingPostId,
    enhancingAction,
    isTogglingGrok,
    isTogglingFirstComment,
    isExpandingToThread,
    isPublished,
    analyticsStats,
    carouselValidation,
    canAddThread,
    canAddFirstComment,
    hasFirstComment,
    firstCommentPost,
    isLastChildGrokTweet,
    hasChildren,
    publishedDisplay,
    isContentDirty,
    isScheduleDirty,
    draggedPostId,
    dragOverDividerIndex,
    handleContentSave,
    handleScheduleSave,
    handlePublishNow,
    handlePublishViaTikTokApp,
    handleAddToThread,
    handleDeletePost,
    handleDeleteChild,
    handleSelectMedia,
    handleGenerateIllustration,
    handleQuickAction,
    handlePerTweetEnhance,
    handleDragStart,
    handleDragEnd,
    handleDrop,
    handleToggleGrokFeedback,
    handleToggleFirstComment,
    handleUpdateChild,
    handleExpandToThread,
    setViewMode,
    setFocusedPostId,
    setLabelDraft,
    setDescriptionDraft,
    setChildDescription,
    setScheduleDraft,
    setDragOverDividerIndex,
    autoSaveRefs,
    performAutoSaveForPost,
    getPostsService,
    notificationsService,
    refreshPost,
  } = hookData;
  const [isScoringSeo, setIsScoringSeo] = useState(false);
  const reviewSummary: PostReviewSummary | undefined = post
    ? {
        generationId: (post as { generationId?: string }).generationId,
        promptUsed: (post as { promptUsed?: string }).promptUsed,
        reviewBatchId: (post as { reviewBatchId?: string }).reviewBatchId,
        reviewDecision: normalizeReviewDecision(post.reviewDecision),
        reviewEvents: post.reviewEvents,
        reviewedAt: (post as { reviewedAt?: string }).reviewedAt,
        reviewFeedback: (post as { reviewFeedback?: string }).reviewFeedback,
        reviewItemId: (post as { reviewItemId?: string }).reviewItemId,
        sourceActionId: (post as { sourceActionId?: string }).sourceActionId,
        sourceWorkflowId: (post as { sourceWorkflowId?: string })
          .sourceWorkflowId,
        sourceWorkflowName: (post as { sourceWorkflowName?: string })
          .sourceWorkflowName,
      }
    : undefined;

  // Published-post variations use the same setup and review path as Discover.
  const handleCreateRemix = useCallback(() => {
    if (!post?.platform) {
      return;
    }
    router.push(
      href(
        buildSourcePostVariationsHref({
          platform: post.platform,
          postId: post.id,
        }),
      ),
    );
  }, [href, post, router]);

  // Handler for repurposing the post to another channel (#2588)
  const handleRepurpose = useCallback(() => {
    if (!post) {
      return;
    }

    openPostRepurposeModal(
      { id: post.id, label: post.label, platform: post.platform },
      async (platform, mode) => {
        try {
          const service = await getPostsService();
          const draft = await service.repurpose(post.id, { mode, platform });
          if (mode === PostRepurposeMode.AGENT) {
            notificationsService.success(
              'Rewritten draft sent to the review queue',
            );
            router.push(
              href(
                draft.reviewBatchId
                  ? `/publish/review?batch=${draft.reviewBatchId}&filter=ready`
                  : '/publish/review',
              ),
            );
          } else {
            notificationsService.success('Repurposed draft created');
            router.push(href(getPublisherPostHref(draft.id)));
          }
        } catch (error) {
          notificationsService.error('Failed to repurpose post');
          throw error;
        }
      },
    );
  }, [
    post,
    openPostRepurposeModal,
    getPostsService,
    notificationsService,
    router,
    href,
  ]);

  // Handler for duplicating a post (create copy as draft)
  const handleDuplicate = useCallback(async () => {
    if (!post) {
      return;
    }
    try {
      const service = await getPostsService();
      const duplicated = await service.duplicate(post.id);
      notificationsService.success('Post duplicated as draft');
      router.push(href(getPublisherPostHref(duplicated.id)));
    } catch {
      notificationsService.error('Failed to duplicate post');
    }
  }, [post, getPostsService, notificationsService, router, href]);

  const handleScoreSeo = useCallback(async () => {
    if (!post || isScoringSeo || isContentDirty) {
      return;
    }

    setIsScoringSeo(true);

    try {
      const service = await getPostsService();
      await service.scoreSeo(post.id);
      await refreshPost(true);
      notificationsService.success('SEO score updated');
    } catch {
      notificationsService.error('Failed to score SEO');
    } finally {
      setIsScoringSeo(false);
    }
  }, [
    post,
    isScoringSeo,
    isContentDirty,
    getPostsService,
    refreshPost,
    notificationsService,
  ]);

  const isPagePresentation = presentation === 'page';
  const wrapperClassName = isPagePresentation ? 'container mx-auto p-6' : '';

  const handleScheduleChange = useCallback(
    (value: typeof scheduleDraft) => {
      setScheduleDraft(value);
    },
    [setScheduleDraft],
  );

  // Stable node for workspace Context adapter registration — rebuilding this
  // JSX every keystroke was thrashing parent memos. Hooks stay above early returns.
  const sidebar = useMemo(() => {
    if (!post) {
      return null;
    }
    return (
      <div className="space-y-3">
        <PostDetailSidebar
          post={post}
          credential={credential}
          scheduleDraft={scheduleDraft}
          isSavingSchedule={isSavingSchedule}
          isScheduleDirty={isScheduleDirty}
          isScoringSeo={isScoringSeo}
          isSeoDirty={isContentDirty}
          analyticsStats={analyticsStats}
          reviewSummary={reviewSummary}
          onScheduleChange={handleScheduleChange}
          onScheduleSave={handleScheduleSave}
          onPublishNow={handlePublishNow}
          onPublishViaTikTokApp={handlePublishViaTikTokApp}
          onScoreSeo={handleScoreSeo}
        />
        {!isPublished ? <EngagementPreview post={post} /> : null}
      </div>
    );
  }, [
    analyticsStats,
    credential,
    handleScheduleChange,
    handleScheduleSave,
    handlePublishNow,
    handlePublishViaTikTokApp,
    handleScoreSeo,
    isContentDirty,
    isPublished,
    isSavingSchedule,
    isScheduleDirty,
    isScoringSeo,
    post,
    reviewSummary,
    scheduleDraft,
  ]);
  const usesContextSidebar = Boolean(renderContextSidebar);
  const contextLabel =
    labelDraft?.trim() || post?.label?.trim() || 'Untitled post';

  // Error state
  if (error) {
    return (
      <div className={wrapperClassName}>
        <Card className="p-4">
          <div className="text-error mb-4">{error}</div>
        </Card>
      </div>
    );
  }

  // Not-found state — distinct from "still loading" so the shell below can
  // keep rendering while the record is in flight.
  if (!isLoading && !post) {
    return (
      <div className={wrapperClassName}>
        <Card className="p-4">
          <div className="text-error mb-4">{translate('notFound')}</div>
        </Card>
      </div>
    );
  }

  return (
    <>
      {usesContextSidebar && sidebar
        ? renderContextSidebar?.(sidebar, contextLabel)
        : null}
      <div className={wrapperClassName}>
        {post?.status === PostStatus.FAILED ? (
          <Alert type={AlertCategory.ERROR} className="mb-6">
            <p className="font-semibold">Publication Failed</p>
            <p>
              This post failed to publish. You can edit and reschedule it below.
            </p>
          </Alert>
        ) : null}

        {post ? (
          <PostDetailHeader
            post={post}
            scope={scope}
            isPublished={isPublished}
            hasChildren={hasChildren}
            viewMode={viewMode}
            isExpandingToThread={isExpandingToThread}
            onViewModeChange={setViewMode}
            onDelete={handleDeletePost}
            onCreateRemix={
              isSourcePostVariationPlatform(post.platform)
                ? handleCreateRemix
                : undefined
            }
            onDuplicate={handleDuplicate}
            onExpandToThread={handleExpandToThread}
            onRepurpose={handleRepurpose}
          />
        ) : (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-foreground/60">{translate('title')}</p>
              <h2 className="text-2xl font-bold">
                {translate('loadingSubtitle')}
              </h2>
            </div>
          </div>
        )}

        {post ? (
          <div
            className={
              usesContextSidebar
                ? 'min-w-0'
                : 'grid gap-4 lg:grid-cols-[2fr_1fr]'
            }
          >
            <PostDetailContent
              post={post}
              sortedChildren={sortedChildren}
              scope={scope}
              viewMode={viewMode}
              descriptionDraft={descriptionDraft}
              labelDraft={labelDraft}
              childDescriptions={childDescriptions}
              selectedIngredients={selectedIngredients}
              focusedPostId={focusedPostId}
              draggedPostId={draggedPostId}
              dragOverDividerIndex={dragOverDividerIndex}
              enhancingPostId={enhancingPostId}
              enhancingAction={enhancingAction}
              isSavingIngredients={isSavingIngredients}
              isSavingDescription={isSavingDescription}
              isTogglingGrok={isTogglingGrok}
              isTogglingFirstComment={isTogglingFirstComment}
              carouselValidation={carouselValidation}
              publishedDisplay={publishedDisplay}
              isContentDirty={isContentDirty}
              canAddThread={canAddThread}
              canAddFirstComment={canAddFirstComment}
              hasFirstComment={hasFirstComment}
              firstCommentPost={firstCommentPost}
              isLastChildGrokTweet={isLastChildGrokTweet}
              hasChildren={hasChildren}
              setDescriptionDraft={setDescriptionDraft}
              setLabelDraft={setLabelDraft}
              setChildDescription={setChildDescription}
              setFocusedPostId={setFocusedPostId}
              setDragOverDividerIndex={setDragOverDividerIndex}
              handleContentSave={handleContentSave}
              handleAddToThread={handleAddToThread}
              handleDeleteChild={handleDeleteChild}
              handleSelectMedia={handleSelectMedia}
              handleGenerateIllustration={handleGenerateIllustration}
              handleQuickAction={handleQuickAction}
              handlePerTweetEnhance={handlePerTweetEnhance}
              handleDragStart={handleDragStart}
              handleDragEnd={handleDragEnd}
              handleDrop={handleDrop}
              handleToggleGrokFeedback={handleToggleGrokFeedback}
              handleToggleFirstComment={handleToggleFirstComment}
              handleUpdateChild={handleUpdateChild}
              autoSaveRefs={autoSaveRefs}
              performAutoSaveForPost={performAutoSaveForPost}
              getPostsService={getPostsService}
              notificationsService={notificationsService}
            />

            {!usesContextSidebar ? (
              <div className="space-y-4">{sidebar}</div>
            ) : null}
          </div>
        ) : (
          <div
            className="grid gap-6 lg:grid-cols-3"
            data-testid="post-detail-skeleton"
          >
            <div className="lg:col-span-2 space-y-6">
              <SkeletonCard showImage={false} />
              <SkeletonCard showImage={false} />
            </div>
            <div className="space-y-6">
              <SkeletonCard showImage={false} />
              <SkeletonCard showImage={false} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
