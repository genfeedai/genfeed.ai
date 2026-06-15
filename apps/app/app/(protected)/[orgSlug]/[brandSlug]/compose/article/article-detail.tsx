'use client';

import {
  type AgentDraftSuggestionPayload,
  useAgentDraftContext,
} from '@genfeedai/agent';
import { ArticleCategory, ArticleStatus } from '@genfeedai/enums';
import type { Article } from '@genfeedai/models/content/article.model';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useArticleDetail } from '@hooks/pages/use-article-detail/use-article-detail';
import { useXArticleCompose } from '@hooks/pages/use-x-article-compose/use-x-article-compose';
import type { ArticleEditorProps } from '@props/content/article-editor.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { PostsService } from '@services/content/posts.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import XArticleAssetsBar from '@ui/articles/x-article/XArticleAssetsBar';
import Card from '@ui/card/Card';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Breadcrumb from '@ui/navigation/breadcrumb/Breadcrumb';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import ArticleDetailHeader from './article-detail-header';
import ArticleEditForm from './article-edit-form';
import ArticlePreview from './article-preview';
import ArticleSidebar from './article-sidebar';

type TeaserFormat = 'post' | 'thread';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyDraftSuggestionToHtml(
  currentContent: string,
  payload: AgentDraftSuggestionPayload,
): string {
  const suggestion = payload.text.trim();
  const selectedText = payload.selectedText?.trim();

  if (selectedText && currentContent.includes(selectedText)) {
    return currentContent.replace(selectedText, escapeHtml(suggestion));
  }

  const paragraph = `<p>${escapeHtml(suggestion)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')}</p>`;

  if (!currentContent.trim()) {
    return paragraph;
  }

  return `${currentContent}${paragraph}`;
}

function buildXArticleTeaserPrompt(
  article: Article,
  format: TeaserFormat,
): string {
  const sectionHeadings =
    article.xArticleMetadata?.sections
      ?.slice(0, 5)
      .flatMap((section) => (section.heading ? [section.heading] : []))
      .join(', ') || 'the article sections';
  const formatInstruction =
    format === 'thread'
      ? 'Create a short X thread teaser that invites people to read the full X Article.'
      : 'Create one publishable X post teaser that invites people to read the full X Article.';

  return [
    formatInstruction,
    `Title: ${article.label}`,
    article.summary ? `Summary: ${article.summary}` : undefined,
    `Key sections: ${sectionHeadings}`,
    'Do not exceed standard X post limits. Do not claim the article is already linked unless a URL is included.',
  ]
    .filter(Boolean)
    .join('\n');
}

export default function ArticleDetail({
  articleId,
  credentialId,
}: ArticleEditorProps) {
  const { openConfirm } = useConfirmModal();
  const params = useParams<{ brandSlug?: string; orgSlug?: string }>();
  const { push } = useRouter();
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [generatingTeaserFormat, setGeneratingTeaserFormat] =
    useState<TeaserFormat | null>(null);
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getPostsService = useAuthedService(
    useCallback((token: string) => PostsService.getInstance(token), []),
  );

  const {
    article,
    isLoading,
    isSaving,
    isEnhancing,
    isDirty,
    error,
    form,
    setFormField,
    handleSave,
    handlePublish,
    handleArchive,
    handleDelete,
    handleEnhance,
    pathname,
  } = useArticleDetail({ articleId });

  const hasXArticleSections =
    !!article?.xArticleMetadata?.sections &&
    article.xArticleMetadata.sections.length > 0;
  const isXArticle =
    hasXArticleSections || form.category === ArticleCategory.X_ARTICLE;
  const {
    handleCopySection,
    handleCopyFullArticle,
    handleDownloadImage,
    handleGenerateHeaderImage,
    isGeneratingImage,
  } = useXArticleCompose(article);

  const isNew = !articleId && !article;
  const isPublished = form.status === ArticleStatus.PUBLIC;
  const canPublish =
    !!article && !isXArticle && !isPublished && form.label.trim().length > 0;
  const canArchive = !!article && isPublished;
  const plainTextContent = form.content.replace(/<[^>]*>/g, '').trim();
  const canGenerateTeaser = !!article && hasXArticleSections && !!credentialId;

  const handleApplyDraftSuggestion = useCallback(
    (payload: AgentDraftSuggestionPayload) => {
      setFormField(
        'content',
        applyDraftSuggestionToHtml(form.content, payload),
      );
    },
    [form.content, setFormField],
  );

  useAgentDraftContext({
    body: form.content,
    contentFormat: isXArticle ? 'X Article' : 'Article',
    draftType: 'article',
    onApplySuggestion: handleApplyDraftSuggestion,
    selectionRootId: 'article-compose-workspace',
    summary: form.summary,
    title: form.label,
  });

  const handleGenerateTeaser = useCallback(
    async (format: TeaserFormat) => {
      if (!article || !credentialId || generatingTeaserFormat) {
        return;
      }

      setGeneratingTeaserFormat(format);

      try {
        const postsService = await getPostsService();
        const drafts = await postsService.generateAccountContent({
          count: format === 'thread' ? 3 : 1,
          credential: credentialId,
          format,
          tone: 'professional',
          topic: buildXArticleTeaserPrompt(article, format),
        });
        const rootDraft = drafts[0];

        notificationsService.success(
          format === 'thread'
            ? 'X thread teaser draft created'
            : 'X post teaser draft created',
        );

        if (rootDraft?.id && params?.orgSlug && params?.brandSlug) {
          push(`/${params.orgSlug}/${params.brandSlug}/posts/${rootDraft.id}`);
        }
      } catch (err) {
        logger.error('Failed to generate X Article teaser draft', err);
        notificationsService.error('Generate X teaser');
      } finally {
        setGeneratingTeaserFormat(null);
      }
    },
    [
      article,
      credentialId,
      generatingTeaserFormat,
      getPostsService,
      notificationsService,
      params?.brandSlug,
      params?.orgSlug,
      push,
    ],
  );

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Breadcrumb
          segments={[
            { href: COMPOSE_ROUTES.ARTICLE, label: 'Articles' },
            { href: pathname, label: 'Loading...' },
          ]}
        />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <SkeletonCard showImage={false} />
            <SkeletonCard showImage={false} />
          </div>
          <div className="space-y-6">
            <SkeletonCard showImage={false} />
          </div>
        </div>
      </div>
    );
  }

  if (error && !article) {
    return (
      <div className="container mx-auto p-6">
        <Breadcrumb
          segments={[
            { href: COMPOSE_ROUTES.ARTICLE, label: 'Articles' },
            { href: pathname, label: 'Error' },
          ]}
        />
        <Card className="p-4">
          <div className="text-error mb-4">{error}</div>
        </Card>
      </div>
    );
  }

  return (
    <div id="article-compose-workspace" className="container mx-auto p-6">
      {/* Header */}
      <Breadcrumb
        segments={[
          { href: COMPOSE_ROUTES.ARTICLE, label: 'Articles' },
          {
            href: pathname,
            label: isNew ? 'New Article' : form.label || 'Untitled',
          },
        ]}
      />

      <ArticleDetailHeader
        state={{ isNew, hasXArticleSections, isDirty, isSaving }}
        permissions={{ canPublish, canArchive }}
        viewMode={viewMode}
        setViewMode={setViewMode}
        formLabel={form.label}
        plainTextContent={plainTextContent}
        openConfirm={openConfirm}
        onPublish={handlePublish}
        onArchive={handleArchive}
        onDelete={handleDelete}
        onSave={handleSave}
        onCopyFullArticle={handleCopyFullArticle}
        clipboardService={clipboardService}
      />

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Left column: Editor */}
        <div className="space-y-4">
          {/* X Article assets bar */}
          {hasXArticleSections && article?.xArticleMetadata && (
            <XArticleAssetsBar
              article={article}
              metadata={article.xArticleMetadata}
              onCopyFullArticle={handleCopyFullArticle}
              onDownloadImage={handleDownloadImage}
              onGenerateHeaderImage={handleGenerateHeaderImage}
              onGenerateTeaserPost={
                canGenerateTeaser
                  ? () => void handleGenerateTeaser('post')
                  : undefined
              }
              onGenerateTeaserThread={
                canGenerateTeaser
                  ? () => void handleGenerateTeaser('thread')
                  : undefined
              }
              isGeneratingImage={isGeneratingImage}
              isGeneratingTeaser={!!generatingTeaserFormat}
            />
          )}

          {viewMode === 'edit' ? (
            <ArticleEditForm
              form={form}
              setFormField={setFormField}
              isNew={isNew}
              isEnhancing={isEnhancing}
              onEnhance={handleEnhance}
            />
          ) : (
            <ArticlePreview
              form={form}
              hasXArticleSections={hasXArticleSections}
              article={article}
              onCopySection={handleCopySection}
            />
          )}
        </div>

        {/* Right column */}
        <ArticleSidebar form={form} article={article} />
      </div>
    </div>
  );
}
