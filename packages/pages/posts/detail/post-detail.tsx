'use client';

import { AlertCategory, PostStatus } from '@genfeedai/enums';
import { getPublisherPostsHref } from '@helpers/content/posts.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { usePostDetail } from '@hooks/pages/use-post-detail/use-post-detail';
import PostDetailContent from '@pages/posts/detail/components/PostDetailContent';
import PostDetailHeader from '@pages/posts/detail/components/PostDetailHeader';
import type { PostReviewSummary } from '@props/components/post-detail-sidebar.props';
import { usePostRemixModal } from '@providers/global-modals/global-modals.provider';
import Card from '@ui/card/Card';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Alert from '@ui/feedback/alert/Alert';
import Breadcrumb from '@ui/navigation/breadcrumb/Breadcrumb';
import EngagementPreview from '@ui/posts/engagement-preview/EngagementPreview';
import PostDetailSidebar from '@ui/posts/post-detail-sidebar/PostDetailSidebar';
import type { PageScope } from '@ui-constants/misc.constant';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export interface PostDetailProps {
  postId: string;
  scope: PageScope;
  presentation?: 'page' | 'overlay';
}

export default function PostDetail({
  postId,
  scope,
  presentation = 'page',
}: PostDetailProps) {
  const router = useRouter();
  const { href } = useOrgUrl();
  const { openPostRemixModal } = usePostRemixModal();
  const hookData = usePostDetail({ postId, scope });

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
    isUpdating,
    isSavingDescription,
    isSavingSchedule,
    isSavingIngredients,
    enhancingPostId,
    enhancingAction,
    isTogglingGrok,
    isTogglingFirstComment,
    isExpandingToThread,
    isEditable,
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
    pathname,
  } = hookData;
  const reviewSummary: PostReviewSummary | undefined = post
    ? {
        generationId: (post as { generationId?: string }).generationId,
        promptUsed: (post as { promptUsed?: string }).promptUsed,
        reviewBatchId: (post as { reviewBatchId?: string }).reviewBatchId,
        reviewDecision: (
          post as {
            reviewDecision?: 'approved' | 'rejected' | 'request_changes';
          }
        ).reviewDecision,
        reviewEvents: (
          post as {
            reviewEvents?: Array<{
              decision: 'approved' | 'rejected' | 'request_changes';
              feedback?: string;
              reviewedAt: string;
            }>;
          }
        ).reviewEvents,
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

  // Handler for creating a remix post
  const handleCreateRemix = useCallback(() => {
    if (!post) {
      return;
    }

    openPostRemixModal(post, async (description, label) => {
      try {
        const service = await getPostsService();
        const remixPost = await service.createRemix(
          post.id,
          description,
          label,
        );
        notificationsService.success('Remix post created as draft');
        // Navigate to the new post
        router.push(href(`/posts/${remixPost.id}`));
      } catch (error) {
        notificationsService.error('Failed to create remix post');
        throw error;
      }
    });
  }, [post, openPostRemixModal, getPostsService, notificationsService, router]);

  // Handler for duplicating a post (create copy as draft)
  const handleDuplicate = useCallback(async () => {
    if (!post) {
      return;
    }
    try {
      const service = await getPostsService();
      const duplicated = await service.duplicate(post.id);
      notificationsService.success('Post duplicated as draft');
      router.push(href(`/posts/${duplicated.id}`));
    } catch {
      notificationsService.error('Failed to duplicate post');
    }
  }, [post, getPostsService, notificationsService, router]);

  const isPagePresentation = presentation === 'page';
  const wrapperClassName = isPagePresentation ? 'container mx-auto p-6' : '';

  // Loading state
  if (isLoading) {
    return (
      <div className={wrapperClassName}>
        {isPagePresentation ? (
          <Breadcrumb
            segments={[
              { href: getPublisherPostsHref(), label: 'Posts' },
              { href: pathname, label: 'Loading...' },
            ]}
          />
        ) : null}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <SkeletonCard showImage={false} />
            <SkeletonCard showImage={false} />
          </div>
          <div className="space-y-6">
            <SkeletonCard showImage={false} />
            <SkeletonCard showImage={false} />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !post) {
    return (
      <div className={wrapperClassName}>
        {isPagePresentation ? (
          <Breadcrumb
            segments={[
              { href: getPublisherPostsHref(), label: 'Posts' },
              { href: pathname, label: 'Error' },
            ]}
          />
        ) : null}
        <Card className="p-4">
          <div className="text-error mb-4">{error || 'Post not found'}</div>
        </Card>
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      {/* Failed post warning banner */}
      {post.status === PostStatus.FAILED && (
        <Alert type={AlertCategory.ERROR} className="mb-6">
          <p className="font-semibold">Publication Failed</p>
          <p>
            This post failed to publish. You can edit and reschedule it below.
          </p>
        </Alert>
      )}

      <PostDetailHeader
        post={post}
        pathname={pathname}
        scope={scope}
        showBreadcrumb={isPagePresentation}
        isPublished={isPublished}
        hasChildren={hasChildren}
        viewMode={viewMode}
        isExpandingToThread={isExpandingToThread}
        onViewModeChange={setViewMode}
        onDelete={handleDeletePost}
        onCreateRemix={handleCreateRemix}
        onDuplicate={handleDuplicate}
        onExpandToThread={handleExpandToThread}
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
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

        <div className="space-y-4">
          <PostDetailSidebar
            post={post}
            credential={credential}
            scheduleDraft={scheduleDraft}
            isSavingSchedule={isSavingSchedule}
            isScheduleDirty={isScheduleDirty}
            analyticsStats={analyticsStats}
            reviewSummary={reviewSummary}
            onScheduleChange={(value) => setScheduleDraft(value)}
            onScheduleSave={handleScheduleSave}
          />

          {/* Engagement Preview - shown for unpublished posts */}
          {!isPublished && <EngagementPreview post={post} />}
        </div>
      </div>
    </div>
  );
}
