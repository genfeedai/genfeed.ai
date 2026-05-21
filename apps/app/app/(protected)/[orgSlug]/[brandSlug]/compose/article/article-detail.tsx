'use client';

import {
  type AgentDraftSuggestionPayload,
  useAgentDraftContext,
} from '@genfeedai/agent';
import {
  ArticleCategory,
  ArticleStatus,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/enums';
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
import XArticleSectionCard from '@ui/articles/x-article/XArticleSectionCard';
import Card from '@ui/card/Card';
import HtmlContent from '@ui/display/html-content/HtmlContent';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import Breadcrumb from '@ui/navigation/breadcrumb/Breadcrumb';
import ContentPreviewSidebar from '@ui/preview/ContentPreviewSidebar';
import { Button } from '@ui/primitives/button';
import FormDropdown from '@ui/primitives/dropdown-field';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import PromptBarArticle from '@ui/prompt-bars/article/PromptBarArticle';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import { useParams, useRouter } from 'next/navigation';
import type { ChangeEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';
import {
  HiArchiveBox,
  HiCheck,
  HiClipboardDocument,
  HiExclamationCircle,
  HiEye,
  HiPencil,
  HiRocketLaunch,
  HiTrash,
} from 'react-icons/hi2';

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

const ARTICLE_CATEGORY_OPTIONS = Object.values(ArticleCategory).map(
  (value) => ({
    key: value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  }),
);

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

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-foreground/60">
            {isNew ? 'Compose new article' : 'Article editor'}
          </p>
          <h1 className="text-2xl font-semibold">
            {isNew ? 'New Article' : form.label || 'Untitled Article'}
          </h1>
        </div>

        <div className="flex gap-2">
          {/* View mode toggle */}
          {!isNew && (
            <Button
              label={viewMode === 'edit' ? 'Preview' : 'Edit'}
              variant={ButtonVariant.SECONDARY}
              onClick={() =>
                setViewMode(viewMode === 'edit' ? 'preview' : 'edit')
              }
              icon={
                viewMode === 'edit' ? (
                  <HiEye className="size-4" />
                ) : (
                  <HiPencil className="size-4" />
                )
              }
            />
          )}

          {/* Publish */}
          {canPublish && (
            <Button
              label="Publish"
              variant={ButtonVariant.DEFAULT}
              icon={<HiRocketLaunch className="size-4" />}
              onClick={() =>
                openConfirm({
                  cancelLabel: 'Cancel',
                  confirmLabel: 'Publish',
                  label: 'Publish Article',
                  message:
                    'Are you sure you want to publish this article? It will be visible to the public.',
                  onConfirm: handlePublish,
                })
              }
            />
          )}

          {/* Archive */}
          {canArchive && (
            <Button
              label="Archive"
              variant={ButtonVariant.SECONDARY}
              icon={<HiArchiveBox className="size-4" />}
              onClick={() =>
                openConfirm({
                  cancelLabel: 'Cancel',
                  confirmLabel: 'Archive',
                  label: 'Archive Article',
                  message:
                    'Are you sure you want to archive this article? It will be hidden from public view.',
                  onConfirm: handleArchive,
                })
              }
            />
          )}

          <Button
            label="Copy Article"
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            icon={<HiClipboardDocument className="size-4" />}
            onClick={() =>
              void clipboardService.copyToClipboard(
                [form.label.trim(), plainTextContent]
                  .filter(Boolean)
                  .join('\n\n'),
              )
            }
          />

          {/* Copy Full Article (X Article only) */}
          {hasXArticleSections && (
            <Button
              label="Copy for X Article"
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              icon={<HiClipboardDocument className="size-4" />}
              onClick={handleCopyFullArticle}
            />
          )}

          {/* Save */}
          <Button
            icon={
              isDirty ? (
                <HiExclamationCircle className="size-4" />
              ) : (
                <HiCheck className="size-4" />
              )
            }
            label={isSaving ? 'Saving...' : isDirty ? 'Save' : 'Saved'}
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            className={
              isDirty
                ? 'bg-warning text-warning-foreground hover:bg-warning/90'
                : 'bg-success text-success-foreground hover:bg-success/90'
            }
            isLoading={isSaving}
            isDisabled={!isDirty || isSaving}
            onClick={handleSave}
          />

          {/* Delete */}
          {!isNew && (
            <Button
              label="Delete"
              variant={ButtonVariant.DESTRUCTIVE}
              icon={<HiTrash className="size-4" />}
              onClick={() =>
                openConfirm({
                  cancelLabel: 'Cancel',
                  confirmLabel: 'Delete',
                  isError: true,
                  label: 'Delete Article',
                  message:
                    'Are you sure you want to delete this article? This action cannot be undone.',
                  onConfirm: handleDelete,
                })
              }
            />
          )}
        </div>
      </div>

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
            <>
              {/* Title */}
              <Card className="space-y-4">
                <FormControl label="Title">
                  <Input
                    name="articleTitle"
                    value={form.label}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setFormField('label', e.target.value)
                    }
                    placeholder="Enter article title"
                  />
                </FormControl>

                <FormControl label="Slug">
                  <Input
                    name="articleSlug"
                    value={form.slug}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setFormField('slug', e.target.value)
                    }
                    placeholder="article-url-slug"
                  />
                </FormControl>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormControl label="Category">
                    <FormDropdown
                      name="articleCategory"
                      value={form.category}
                      options={ARTICLE_CATEGORY_OPTIONS}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                        setFormField(
                          'category',
                          e.target.value as ArticleCategory,
                        )
                      }
                    />
                  </FormControl>

                  <FormControl label="Tags">
                    <Input
                      name="articleTags"
                      value={form.tags}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setFormField('tags', e.target.value)
                      }
                      placeholder="tag1, tag2, tag3"
                    />
                  </FormControl>
                </div>

                <FormControl label="Summary">
                  <Input
                    name="articleSummary"
                    value={form.summary}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setFormField('summary', e.target.value)
                    }
                    placeholder="Brief description of the article"
                  />
                </FormControl>
              </Card>

              {/* Body Editor */}
              <Card>
                <LazyRichTextEditor
                  value={form.content}
                  onChange={(value: string) => setFormField('content', value)}
                  placeholder="Start writing your article..."
                  minHeight={{ desktop: 500, mobile: 300 }}
                />
              </Card>

              {/* AI Enhancement Bar */}
              {!isNew && (
                <PromptBarArticle
                  onSubmit={handleEnhance}
                  isEnhancing={isEnhancing}
                />
              )}
            </>
          ) : (
            /* Preview mode */
            <>
              <Card className="p-6">
                <article className="prose prose-sm sm:prose lg:prose-lg max-w-none">
                  <h1>{form.label || 'Untitled Article'}</h1>
                  {form.summary && (
                    <p className="text-lg text-foreground/70 italic">
                      {form.summary}
                    </p>
                  )}
                  {!hasXArticleSections && (
                    <HtmlContent content={form.content || ''} />
                  )}
                </article>
              </Card>

              {/* X Article section cards in preview */}
              {hasXArticleSections &&
                article?.xArticleMetadata?.sections.map((section) => (
                  <XArticleSectionCard
                    key={section.id}
                    section={section}
                    onCopy={handleCopySection}
                  />
                ))}
            </>
          )}
        </div>

        {/* Right column: Preview sidebar */}
        <div className="space-y-4">
          <ContentPreviewSidebar
            title={form.label}
            subtitle={form.summary}
            content={form.content}
            platform="article"
          />

          {/* Article stats */}
          {article && (
            <Card className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider">
                Article Info
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground/60">Status</span>
                  <span className="font-medium capitalize">{form.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/60">Words</span>
                  <span className="font-medium">{article.wordCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/60">Reading time</span>
                  <span className="font-medium">
                    {article.readingTime || 0} min
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/60">Category</span>
                  <span className="font-medium capitalize">
                    {form.category}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
