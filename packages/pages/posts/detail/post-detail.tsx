'use client';

import {
  ContextSidebarPanel,
  useContextSidebar,
} from '@contexts/ui/context-sidebar-context';
import {
  ButtonSize,
  ButtonVariant,
  CredentialPlatform,
  normalizeReviewDecision,
  type PageScope,
  PostRepurposeMode,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createPublishingApprovalsRoute,
} from '@genfeedai/contracts/constants';
import { getPublishingPostHref } from '@helpers/content/posts.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { usePostDetail } from '@hooks/pages/use-post-detail/use-post-detail';
import PostDetailContent from '@pages/posts/detail/components/PostDetailContent';
import PostDetailHeader from '@pages/posts/detail/components/PostDetailHeader';
import PostDetailNeedsYou from '@pages/posts/detail/components/PostDetailNeedsYou';
import PostDetailPublished from '@pages/posts/detail/components/PostDetailPublished';
import { buildPostDetailFacts } from '@pages/posts/detail/post-detail-facts.helper';
import { buildPostTargetPreview } from '@pages/posts/detail/post-detail-preview.helpers';
import type { PostReviewSummary } from '@props/components/post-detail-sidebar.props';
import { usePostRepurposeModal } from '@providers/global-modals/global-modals.provider';
import Card from '@ui/card/Card';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import EngagementPreview from '@ui/posts/engagement-preview/EngagementPreview';
import PostDetailSidebar from '@ui/posts/post-detail-sidebar/PostDetailSidebar';
import TargetPreview from '@ui/previews/TargetPreview';
import { Button } from '@ui/primitives/button';
import RecordFactLine from '@ui/record-detail/RecordFactLine';
import {
  buildSourcePostVariationsHref,
  isSourcePostVariationPlatform,
} from '@utils/url/desktop-loop-url.util';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

export interface PostDetailProps {
  postId: string;
  scope: PageScope;
  /**
   * `page` is the full editor. `sidebar` is the compact detail shown in the
   * shell's right context sidebar when a row is selected in a list.
   */
  presentation?: 'page' | 'sidebar';
  /** Sidebar presentation only: called when the sidebar is closed. */
  onClose?: () => void;
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
  onClose,
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
    isTogglingGrok,
    isTogglingFirstComment,
    isExpandingToThread,
    isPublished,
    analyticsStats,
    carouselValidation,
    canAddThread,
    canAddFirstComment,
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
    handleRetryPublish,
    handlePublishViaTikTokApp,
    handleAddToThread,
    handleAddThreadPosts,
    handleDraftThread,
    handleSetGrokQuestion,
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
  const [isTikTokPublishingReady, setIsTikTokPublishingReady] = useState(false);
  const guardTikTokPublish = useCallback(
    (action: () => Promise<void>) => {
      return async () => {
        if (
          post?.platform === CredentialPlatform.TIKTOK &&
          !isTikTokPublishingReady
        ) {
          notificationsService.error(
            'Review and save the TikTok publishing settings before posting.',
          );
          return;
        }
        await handleContentSave();
        await action();
      };
    },
    [
      handleContentSave,
      isTikTokPublishingReady,
      notificationsService,
      post?.platform,
    ],
  );
  const publishNow = useMemo(
    () => guardTikTokPublish(handlePublishNow),
    [guardTikTokPublish, handlePublishNow],
  );
  const publishViaTikTokApp = useMemo(
    () => guardTikTokPublish(handlePublishViaTikTokApp),
    [guardTikTokPublish, handlePublishViaTikTokApp],
  );
  const saveSchedule = useMemo(
    () => guardTikTokPublish(handleScheduleSave),
    [guardTikTokPublish, handleScheduleSave],
  );
  const contextSidebar = useContextSidebar();
  const isStandalonePage = presentation === 'page' && !renderContextSidebar;
  const reviewSummary: PostReviewSummary | undefined = post
    ? {
        generationId: (post as { generationId?: string }).generationId,
        promptUsed: (post as { promptUsed?: string }).promptUsed,
        reviewTurboRunId: (post as { reviewTurboRunId?: string })
          .reviewTurboRunId,
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

  // Published-post variations use the same setup and review path as Discovery.
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
                createPublishingApprovalsRoute({
                  run: draft.reviewTurboRunId,
                  filter: draft.reviewTurboRunId ? 'ready' : undefined,
                }),
              ),
            );
          } else {
            notificationsService.success('Repurposed draft created');
            router.push(href(getPublishingPostHref(draft.id)));
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
      router.push(href(getPublishingPostHref(duplicated.id)));
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
  const wrapperClassName = isPagePresentation
    ? 'container mx-auto flex flex-1 flex-col p-6'
    : '';

  const handleScheduleChange = useCallback(
    (value: typeof scheduleDraft) => {
      setScheduleDraft(value);
    },
    [setScheduleDraft],
  );

  // The thread as each platform renders it. Shown in the sidebar's Preview tab
  // while composing, and in the page body once the post is published.
  const threadPreview = useMemo(() => {
    if (!post) {
      return undefined;
    }
    // The standalone inspector shows every post of the thread as plain text,
    // the way each platform will render it.
    return isStandalonePage ? (
      <div className="space-y-4">
        {[post, ...sortedChildren].map((item, index) => {
          const description =
            index === 0
              ? descriptionDraft
              : (childDescriptions.get(item.id) ?? item.description ?? '');
          const preview = buildPostTargetPreview(
            {
              ...item,
              description,
              ...(index === 0
                ? { ingredients: selectedIngredients, label: labelDraft }
                : {}),
              platform: item.platform ?? post.platform,
            },
            description,
            credential,
          );
          return preview ? <TargetPreview key={item.id} {...preview} /> : null;
        })}
        {!post.platform ? (
          <p className="text-sm text-muted-foreground">
            {translate('choosePlatform')}
          </p>
        ) : null}
        {!isPublished ? <EngagementPreview post={post} /> : null}
      </div>
    ) : undefined;
  }, [
    childDescriptions,
    credential,
    descriptionDraft,
    isPublished,
    isStandalonePage,
    labelDraft,
    post,
    selectedIngredients,
    sortedChildren,
    translate,
  ]);

  // Stable node for workspace Context adapter registration — rebuilding this
  // JSX every keystroke was thrashing parent memos. Hooks stay above early returns.
  const sidebar = useMemo(() => {
    if (!post) {
      return null;
    }
    const targetPreview = buildPostTargetPreview(
      post,
      descriptionDraft,
      credential,
    );
    return (
      <div className="space-y-3">
        <PostDetailSidebar
          isPerformanceShown={!isStandalonePage}
          preview={isPublished ? undefined : threadPreview}
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
          onScheduleSave={saveSchedule}
          onPublishNow={publishNow}
          onPublishViaTikTokApp={publishViaTikTokApp}
          onScoreSeo={handleScoreSeo}
          onSettingsSaved={() => refreshPost(true)}
          onTikTokReadinessChange={setIsTikTokPublishingReady}
        />
        {!isStandalonePage && targetPreview ? (
          <TargetPreview {...targetPreview} />
        ) : null}
        {!isStandalonePage && !isPublished ? (
          <EngagementPreview post={post} />
        ) : null}
      </div>
    );
  }, [
    analyticsStats,
    credential,
    descriptionDraft,
    threadPreview,
    handleScheduleChange,
    handleScoreSeo,
    publishNow,
    publishViaTikTokApp,
    saveSchedule,
    isContentDirty,
    isPublished,
    isSavingSchedule,
    isScheduleDirty,
    isScoringSeo,
    isStandalonePage,
    post,
    refreshPost,
    reviewSummary,
    scheduleDraft,
  ]);
  const usesShellSidebar = isStandalonePage && Boolean(contextSidebar);
  const usesContextSidebar = Boolean(renderContextSidebar) || usesShellSidebar;
  const contextLabel =
    labelDraft?.trim() || post?.label?.trim() || 'Untitled post';

  if (presentation === 'sidebar') {
    const editorHref = href(getPublishingPostHref(postId));
    let panelBody: ReactNode;
    if (error) {
      panelBody = <p className="p-4 text-sm text-error">{error}</p>;
    } else if (!post && !isLoading) {
      panelBody = (
        <p className="p-4 text-sm text-error">{translate('notFound')}</p>
      );
    } else if (!post) {
      panelBody = (
        <div className="p-4" data-testid="post-detail-skeleton">
          <SkeletonCard showImage={false} />
        </div>
      );
    } else {
      panelBody = (
        <>
          <div className="flex justify-end border-b border-border px-4 py-3">
            <Button
              asChild
              icon={<ExternalLink className="size-3.5" />}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            >
              <Link href={editorHref}>{translate('openEditor')}</Link>
            </Button>
          </div>
          <div className="space-y-4 p-4">
            <PostDetailNeedsYou
              isPublished={isPublished}
              onPublishNow={publishNow}
              onRetryPublish={handleRetryPublish}
              onReviewHref={href(APP_ROUTES.PUBLISHING.REVIEW)}
              post={post}
            />
            {sidebar}
          </div>
        </>
      );
    }

    return (
      <ContextSidebarPanel
        onClose={onClose}
        selection={{
          id: postId,
          kind: 'post',
          origin: 'user',
          title: post ? contextLabel : translate('title'),
        }}
      >
        <div className="flex flex-col" data-testid="post-detail-panel">
          {panelBody}
        </div>
      </ContextSidebarPanel>
    );
  }

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

  const headerProps = post
    ? {
        hasChildren,
        headingLevel: isPagePresentation ? (1 as const) : (2 as const),
        isExpandingToThread,
        isPublished,
        isSavingSchedule,
        isScheduleDirty: isScheduleDirty && scheduleDraft !== '',
        onCreateRemix: isSourcePostVariationPlatform(post.platform)
          ? handleCreateRemix
          : undefined,
        onDelete: handleDeletePost,
        onDuplicate: handleDuplicate,
        onExpandToThread: handleExpandToThread,
        onPublishNow: publishNow,
        onRepurpose: handleRepurpose,
        onScheduleSave: saveSchedule,
        onViewModeChange: setViewMode,
        post,
        scope,
        showViewModeToggle: !isStandalonePage,
        viewMode,
      }
    : null;

  return (
    <>
      {renderContextSidebar && sidebar
        ? renderContextSidebar(sidebar, contextLabel)
        : null}
      {usesShellSidebar && post ? (
        <ContextSidebarPanel
          selection={{
            id: post.id,
            kind: 'post',
            origin: 'automatic',
            title: contextLabel,
          }}
        >
          <div className="p-4" data-testid="post-detail-context">
            {sidebar}
          </div>
        </ContextSidebarPanel>
      ) : null}
      {headerProps && isStandalonePage ? (
        <PostDetailHeader {...headerProps} placement="topbar" />
      ) : null}
      <div className={wrapperClassName}>
        {post ? (
          <>
            {headerProps && !isStandalonePage ? (
              <PostDetailHeader {...headerProps} />
            ) : null}

            {!isStandalonePage ? (
              <RecordFactLine
                className="mb-6"
                facts={buildPostDetailFacts(post, isPublished)}
              />
            ) : null}

            <PostDetailNeedsYou
              className="mb-6"
              isPublished={isPublished}
              onPublishNow={publishNow}
              onRetryPublish={handleRetryPublish}
              onReviewHref={href(APP_ROUTES.PUBLISHING.REVIEW)}
              post={post}
            />
          </>
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
                ? 'flex min-w-0 flex-1 flex-col'
                : 'grid min-w-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'
            }
          >
            <section
              aria-label={translate('composerLabel')}
              className="flex min-w-0 flex-1 flex-col"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                {isStandalonePage && isPublished ? (
                  <PostDetailPublished
                    stats={analyticsStats}
                    thread={threadPreview}
                  />
                ) : (
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
                    isSavingIngredients={isSavingIngredients}
                    isSavingDescription={isSavingDescription}
                    isTogglingGrok={isTogglingGrok}
                    isTogglingFirstComment={isTogglingFirstComment}
                    carouselValidation={carouselValidation}
                    publishedDisplay={publishedDisplay}
                    isContentDirty={isContentDirty}
                    canAddThread={canAddThread}
                    canAddFirstComment={canAddFirstComment}
                    firstCommentPost={firstCommentPost}
                    isLastChildGrokTweet={isLastChildGrokTweet}
                    setDescriptionDraft={setDescriptionDraft}
                    setLabelDraft={setLabelDraft}
                    setChildDescription={setChildDescription}
                    setFocusedPostId={setFocusedPostId}
                    setDragOverDividerIndex={setDragOverDividerIndex}
                    handleContentSave={handleContentSave}
                    handleAddToThread={handleAddToThread}
                    handleAddThreadPosts={handleAddThreadPosts}
                    handleDeleteChild={handleDeleteChild}
                    handleSelectMedia={handleSelectMedia}
                    handleGenerateIllustration={handleGenerateIllustration}
                    handleQuickAction={handleQuickAction}
                    handlePerTweetEnhance={handlePerTweetEnhance}
                    handleDraftThread={handleDraftThread}
                    handleDragStart={handleDragStart}
                    handleDragEnd={handleDragEnd}
                    handleDrop={handleDrop}
                    handleToggleGrokFeedback={handleToggleGrokFeedback}
                    handleSetGrokQuestion={handleSetGrokQuestion}
                    handleToggleFirstComment={handleToggleFirstComment}
                    handleUpdateChild={handleUpdateChild}
                    autoSaveRefs={autoSaveRefs}
                    performAutoSaveForPost={performAutoSaveForPost}
                    getPostsService={getPostsService}
                    notificationsService={notificationsService}
                  />
                )}
              </div>
            </section>

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
