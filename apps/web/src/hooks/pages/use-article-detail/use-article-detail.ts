'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { type ArticleCategory, ArticleStatus } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createArtifactEditorRoute,
  normalizeArticleSlug,
} from '@genfeedai/contracts/constants';
import type { Article } from '@genfeedai/models/content/article.model';
import { ArticlesService } from '@genfeedai/services/content/articles.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArticleFormState } from '@/props/content/article-editor.props';

export interface UseArticleDetailOptions {
  articleId?: string;
}

export interface UseArticleDetailReturn {
  article: Article | null;
  isLoading: boolean;
  isSaving: boolean;
  isScoringSeo: boolean;
  isSavingExternalUrl: boolean;
  isDirty: boolean;
  error: string | null;
  form: ArticleFormState;
  setFormField: <K extends keyof ArticleFormState>(
    key: K,
    value: ArticleFormState[K],
  ) => void;
  handleSave: () => Promise<void>;
  handlePublish: () => Promise<void>;
  handleArchive: () => Promise<void>;
  handleDelete: () => Promise<void>;
  handleScoreSeo: () => Promise<void>;
  handleArticleDelivered: () => void;
  handleSaveExternalUrl: (externalUrl: string | null) => Promise<void>;
  pathname: string;
  notificationsService: NotificationsService;
  getArticlesService: () => Promise<ArticlesService>;
}

const DEFAULT_FORM_STATE: ArticleFormState = {
  category: 'post' as ArticleCategory,
  content: '',
  label: '',
  slug: '',
  status: ArticleStatus.DRAFT,
  summary: '',
  tags: '',
};

function articleDetailQueryKey(articleId: string) {
  return ['article-detail', articleId] as const;
}

function toFormState(article: Article): ArticleFormState {
  return {
    category: article.category || ('post' as ArticleCategory),
    content: article.content || '',
    label: article.label || '',
    slug: article.slug || '',
    status: article.status || ArticleStatus.DRAFT,
    summary: article.summary || '',
    tags: article.tags?.map((t) => t.label || t.id).join(', ') || '',
  };
}

function isSameForm(left: ArticleFormState, right: ArticleFormState): boolean {
  return (
    left.label === right.label &&
    left.slug === right.slug &&
    left.summary === right.summary &&
    left.content === right.content &&
    left.category === right.category &&
    left.tags === right.tags
  );
}

export function useArticleDetail({
  articleId,
}: UseArticleDetailOptions): UseArticleDetailReturn {
  const router = useRouter();
  const { href } = useOrgUrl();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { organizationId } = useBrand();
  const notificationsService = NotificationsService.getInstance();

  const getArticlesService = useAuthedService(
    useCallback((token: string) => ArticlesService.getInstance(token), []),
  );

  // Resolve article ID from route param or query string
  const resolvedId = articleId || searchParams?.get('id') || undefined;

  // The article reads through React Query, so reopening it paints the cached
  // copy at once and refreshes it in the background.
  const queryClient = useQueryClient();
  const articleQuery = useAuthedQuery<ArticlesService, Article>({
    enabled: Boolean(resolvedId),
    queryFn: (service, signal) => service.findOne(resolvedId ?? '', {}, signal),
    queryKey: articleDetailQueryKey(resolvedId ?? ''),
    service: (token: string) => ArticlesService.getInstance(token),
  });
  const article = resolvedId ? (articleQuery.data ?? null) : null;
  const isLoading = Boolean(resolvedId) && articleQuery.isPending;
  const articleError = resolvedId ? articleQuery.error : null;
  const error = articleError && !article ? 'Failed to load article' : null;

  useEffect(() => {
    if (!articleError) {
      return;
    }
    logger.error('Failed to fetch article', articleError);
    notificationsService.error('Failed to load article');
  }, [articleError, notificationsService]);

  // The form is seeded from the article: at once from a cached copy, again
  // when another article opens, and from a fresh read only while the form is
  // untouched, so a background refresh never overwrites the user's edits.
  // A mutation writes its result into the cache at `ownWriteAtRef`; the form
  // already reflects it, so that write never re-seeds the form.
  const [form, setForm] = useState<ArticleFormState>(() =>
    article ? toFormState(article) : DEFAULT_FORM_STATE,
  );
  const initialFormRef = useRef<ArticleFormState>(form);
  const seededRef = useRef<{ id: string; updatedAt: number } | null>(
    article && resolvedId
      ? { id: resolvedId, updatedAt: articleQuery.dataUpdatedAt }
      : null,
  );
  const ownWriteAtRef = useRef(0);
  const formRef = useRef(form);
  formRef.current = form;
  const articleUpdatedAt = articleQuery.dataUpdatedAt;

  useEffect(() => {
    if (!article || !resolvedId) {
      return;
    }
    const seeded = seededRef.current;
    const isNewArticle = seeded?.id !== resolvedId;
    if (!isNewArticle && seeded.updatedAt === articleUpdatedAt) {
      return;
    }
    seededRef.current = { id: resolvedId, updatedAt: articleUpdatedAt };
    const isOwnWrite = articleUpdatedAt === ownWriteAtRef.current;
    const isUntouched = isSameForm(formRef.current, initialFormRef.current);
    if (isNewArticle || (!isOwnWrite && isUntouched)) {
      const formState = toFormState(article);
      setForm(formState);
      initialFormRef.current = formState;
    }
  }, [article, articleUpdatedAt, resolvedId]);

  const writeArticle = useCallback(
    (id: string, next: Article) => {
      const updatedAt = Date.now();
      ownWriteAtRef.current = updatedAt;
      queryClient.setQueriesData<Article>(
        { queryKey: articleDetailQueryKey(id) },
        () => next,
        { updatedAt },
      );
    },
    [queryClient],
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isScoringSeo, setIsScoringSeo] = useState(false);
  const [isSavingExternalUrl, setIsSavingExternalUrl] = useState(false);

  const isDirty = !isSameForm(form, initialFormRef.current);

  const setFormField = useCallback(
    <K extends keyof ArticleFormState>(key: K, value: ArticleFormState[K]) => {
      setForm((prev) => {
        const next = { ...prev, [key]: value };
        // Auto-generate slug from title for new articles
        if (key === 'label' && !resolvedId) {
          next.slug = normalizeArticleSlug(value as string);
        }
        return next;
      });
    },
    [resolvedId],
  );

  const handleSave = useCallback(async () => {
    if (isSaving) {
      return;
    }
    setIsSaving(true);

    try {
      const service = await getArticlesService();
      const payload = {
        category: form.category,
        content: form.content,
        label: form.label,
        slug: form.slug,
        status: form.status,
        summary: form.summary,
      };

      if (resolvedId) {
        const updated = await service.patch(resolvedId, payload);
        writeArticle(resolvedId, updated);
        initialFormRef.current = { ...form };
        notificationsService.success('Article saved');
      } else {
        const created = await service.post({
          ...payload,
          organizationId,
        });
        initialFormRef.current = { ...form };
        notificationsService.success('Article created');
        router.push(href(createArtifactEditorRoute('article', created.id)));
      }
    } catch (err) {
      logger.error('Failed to save article', err);
      notificationsService.error('Failed to save article');
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    form,
    href,
    resolvedId,
    getArticlesService,
    notificationsService,
    organizationId,
    router,
    writeArticle,
  ]);

  const handlePublish = useCallback(async () => {
    if (!resolvedId) {
      return;
    }

    try {
      const service = await getArticlesService();
      const updated = await service.publish(resolvedId);
      writeArticle(resolvedId, updated);
      setForm((prev) => ({ ...prev, status: ArticleStatus.PUBLISHED }));
      notificationsService.success('Article published');
    } catch (err) {
      logger.error('Failed to publish article', err);
      notificationsService.error('Failed to publish article');
    }
  }, [resolvedId, getArticlesService, notificationsService, writeArticle]);

  /** A connected-blog delivery also marks the article published server-side. */
  const handleArticleDelivered = useCallback(() => {
    setForm((prev) => ({ ...prev, status: ArticleStatus.PUBLISHED }));
  }, []);

  const handleSaveExternalUrl = useCallback(
    async (externalUrl: string | null) => {
      if (!resolvedId) {
        return;
      }

      setIsSavingExternalUrl(true);
      try {
        const service = await getArticlesService();
        const updated = await service.patch(resolvedId, { externalUrl });
        writeArticle(resolvedId, updated);
        notificationsService.success(
          externalUrl ? 'Live link saved' : 'Live link removed',
        );
      } catch (err) {
        logger.error('Failed to save article live link', err);
        notificationsService.error('Failed to save the live link');
      } finally {
        setIsSavingExternalUrl(false);
      }
    },
    [resolvedId, getArticlesService, notificationsService, writeArticle],
  );

  const handleArchive = useCallback(async () => {
    if (!resolvedId) {
      return;
    }

    try {
      const service = await getArticlesService();
      const updated = await service.archive(resolvedId);
      writeArticle(resolvedId, updated);
      setForm((prev) => ({ ...prev, status: ArticleStatus.ARCHIVED }));
      notificationsService.success('Article archived');
    } catch (err) {
      logger.error('Failed to archive article', err);
      notificationsService.error('Failed to archive article');
    }
  }, [resolvedId, getArticlesService, notificationsService, writeArticle]);

  const handleDelete = useCallback(async () => {
    if (!resolvedId) {
      return;
    }

    try {
      const service = await getArticlesService();
      await service.delete(resolvedId);
      queryClient.removeQueries({
        queryKey: articleDetailQueryKey(resolvedId),
      });
      notificationsService.success('Article deleted');
      router.push(href(APP_ROUTES.PUBLISHING.ROOT));
    } catch (err) {
      logger.error('Failed to delete article', err);
      notificationsService.error('Failed to delete article');
    }
  }, [
    resolvedId,
    getArticlesService,
    href,
    notificationsService,
    queryClient,
    router,
  ]);

  const handleScoreSeo = useCallback(async () => {
    if (!resolvedId || isScoringSeo || isDirty) {
      return;
    }

    setIsScoringSeo(true);

    try {
      const service = await getArticlesService();
      const updated = await service.scoreSeo(resolvedId);
      writeArticle(resolvedId, updated);
      notificationsService.success('SEO score updated');
    } catch (err) {
      logger.error('Failed to score article SEO', err);
      notificationsService.error('Failed to score SEO');
    } finally {
      setIsScoringSeo(false);
    }
  }, [
    resolvedId,
    isScoringSeo,
    isDirty,
    getArticlesService,
    notificationsService,
    writeArticle,
  ]);

  return {
    article,
    error,
    form,
    getArticlesService,
    handleArchive,
    handleArticleDelivered,
    handleDelete,
    handlePublish,
    handleSave,
    handleSaveExternalUrl,
    handleScoreSeo,
    isDirty,
    isLoading,
    isSavingExternalUrl,
    isScoringSeo,
    isSaving,
    notificationsService,
    pathname,
    setFormField,
  };
}
