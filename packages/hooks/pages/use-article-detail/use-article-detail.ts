'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { ArticleCategory, ArticleStatus } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Article } from '@models/content/article.model';
import type { ArticleFormState } from '@props/content/article-editor.props';
import { ArticlesService } from '@services/content/articles.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseArticleDetailOptions {
  articleId?: string;
}

export interface UseArticleDetailReturn {
  article: Article | null;
  isLoading: boolean;
  isSaving: boolean;
  isEnhancing: boolean;
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
  handleEnhance: (prompt: string) => Promise<void>;
  pathname: string;
  notificationsService: NotificationsService;
  getArticlesService: () => Promise<ArticlesService>;
}

const DEFAULT_FORM_STATE: ArticleFormState = {
  category: 'post' as ArticleCategory,
  content: '',
  label: '',
  slug: '',
  status: 'draft' as ArticleStatus,
  summary: '',
  tags: '',
};

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function useArticleDetail({
  articleId,
}: UseArticleDetailOptions): UseArticleDetailReturn {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { organizationId } = useBrand();
  const notificationsService = NotificationsService.getInstance();

  const getArticlesService = useAuthedService(
    useCallback((token: string) => ArticlesService.getInstance(token), []),
  );

  const [article, setArticle] = useState<Article | null>(null);
  const [form, setForm] = useState<ArticleFormState>(DEFAULT_FORM_STATE);
  const [isLoading, setIsLoading] = useState(!!articleId);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialFormRef = useRef<ArticleFormState>(DEFAULT_FORM_STATE);

  // Resolve article ID from route param or query string
  const resolvedId = articleId || searchParams?.get('id') || undefined;

  const isDirty =
    form.label !== initialFormRef.current.label ||
    form.slug !== initialFormRef.current.slug ||
    form.summary !== initialFormRef.current.summary ||
    form.content !== initialFormRef.current.content ||
    form.category !== initialFormRef.current.category ||
    form.tags !== initialFormRef.current.tags;

  // Fetch article
  const fetchArticle = useCallback(async () => {
    if (!resolvedId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const service = await getArticlesService();
      const data = await service.findOne(resolvedId);
      setArticle(data);

      const formState: ArticleFormState = {
        category: data.category || ('post' as ArticleCategory),
        content: data.content || '',
        label: data.label || '',
        slug: data.slug || '',
        status: data.status || ('draft' as ArticleStatus),
        summary: data.summary || '',
        tags: data.tags?.map((t) => t.label || t.id).join(', ') || '',
      };

      setForm(formState);
      initialFormRef.current = formState;
    } catch (err) {
      logger.error('Failed to fetch article', err);
      setError('Failed to load article');
      notificationsService.error('Failed to load article');
    } finally {
      setIsLoading(false);
    }
  }, [resolvedId, getArticlesService, notificationsService]);

  useEffect(() => {
    const controller = new AbortController();
    fetchArticle();
    return () => controller.abort();
  }, [fetchArticle]);

  const setFormField = useCallback(
    <K extends keyof ArticleFormState>(key: K, value: ArticleFormState[K]) => {
      setForm((prev) => {
        const next = { ...prev, [key]: value };
        // Auto-generate slug from title for new articles
        if (key === 'label' && !resolvedId) {
          next.slug = generateSlug(value as string);
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
        setArticle(updated);
        initialFormRef.current = { ...form };
        notificationsService.success('Article saved');
      } else {
        const created = await service.post({
          ...payload,
          organization: organizationId,
        } as unknown as Partial<Article>);
        setArticle(created);
        initialFormRef.current = { ...form };
        notificationsService.success('Article created');
        router.push(`${COMPOSE_ROUTES.ARTICLE}?id=${created.id}`);
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
    resolvedId,
    getArticlesService,
    notificationsService,
    organizationId,
    router,
  ]);

  const handlePublish = useCallback(async () => {
    if (!resolvedId) {
      return;
    }

    try {
      const service = await getArticlesService();
      const updated = await service.publish(resolvedId);
      setArticle(updated);
      setForm((prev) => ({ ...prev, status: 'public' as ArticleStatus }));
      notificationsService.success('Article published');
    } catch (err) {
      logger.error('Failed to publish article', err);
      notificationsService.error('Failed to publish article');
    }
  }, [resolvedId, getArticlesService, notificationsService]);

  const handleArchive = useCallback(async () => {
    if (!resolvedId) {
      return;
    }

    try {
      const service = await getArticlesService();
      const updated = await service.archive(resolvedId);
      setArticle(updated);
      setForm((prev) => ({ ...prev, status: 'archived' as ArticleStatus }));
      notificationsService.success('Article archived');
    } catch (err) {
      logger.error('Failed to archive article', err);
      notificationsService.error('Failed to archive article');
    }
  }, [resolvedId, getArticlesService, notificationsService]);

  const handleDelete = useCallback(async () => {
    if (!resolvedId) {
      return;
    }

    try {
      const service = await getArticlesService();
      await service.delete(resolvedId);
      notificationsService.success('Article deleted');
      router.push(COMPOSE_ROUTES.ARTICLE);
    } catch (err) {
      logger.error('Failed to delete article', err);
      notificationsService.error('Failed to delete article');
    }
  }, [resolvedId, getArticlesService, notificationsService, router]);

  const handleEnhance = useCallback(
    async (prompt: string) => {
      if (!resolvedId || isEnhancing) {
        return;
      }

      setIsEnhancing(true);

      try {
        const service = await getArticlesService();
        const updated = await service.enhance(resolvedId, prompt);
        setArticle(updated);

        const formState: ArticleFormState = {
          category: updated.category || form.category,
          content: updated.content || form.content,
          label: updated.label || form.label,
          slug: updated.slug || form.slug,
          status: updated.status || form.status,
          summary: updated.summary || form.summary,
          tags: form.tags,
        };

        setForm(formState);
        initialFormRef.current = formState;
        notificationsService.success('Article enhanced');
      } catch (err) {
        logger.error('Failed to enhance article', err);
        notificationsService.error('Failed to enhance article');
      } finally {
        setIsEnhancing(false);
      }
    },
    [resolvedId, isEnhancing, getArticlesService, notificationsService, form],
  );

  return {
    article,
    error,
    form,
    getArticlesService,
    handleArchive,
    handleDelete,
    handleEnhance,
    handlePublish,
    handleSave,
    isDirty,
    isEnhancing,
    isLoading,
    isSaving,
    notificationsService,
    pathname,
    setFormField,
  };
}
