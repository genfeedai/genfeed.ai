import { ArticleStatus } from '@genfeedai/enums';
import { useArticleDetail } from '@hooks/pages/use-article-detail/use-article-detail';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const postMock = vi.fn();
const findOneMock = vi.fn();
const scoreSeoMock = vi.fn();
const patchMock = vi.fn();
const publishMock = vi.fn();
const archiveMock = vi.fn();
const deleteMock = vi.fn();
const enhanceMock = vi.fn();
const notificationsServiceMock = {
  error: vi.fn(),
  success: vi.fn(),
};
const articlesServiceMock = {
  archive: archiveMock,
  delete: deleteMock,
  enhance: enhanceMock,
  findOne: findOneMock,
  patch: patchMock,
  post: postMock,
  publish: publishMock,
  scoreSeo: scoreSeoMock,
};
const getArticlesServiceMock = vi.fn(async () => articlesServiceMock);

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => getArticlesServiceMock),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: vi.fn(() => ({
    brandSlug: 'paperclip',
    href: (path: string) => `/genfeed-ai/paperclip${path}`,
    orgHref: (path: string) => `/genfeed-ai${path}`,
    orgSlug: 'genfeed-ai',
  })),
}));

vi.mock('@genfeedai/services/content/articles.service', () => ({
  ArticlesService: {
    getInstance: vi.fn(() => articlesServiceMock),
  },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => notificationsServiceMock),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/manager/articles/article-1'),
  useRouter: vi.fn(() => ({ push: pushMock })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

describe('useArticleDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOneMock.mockResolvedValue({
      category: 'post',
      content: '',
      id: 'article-1',
      label: 'Existing article',
      slug: 'existing-article',
      status: ArticleStatus.DRAFT,
      summary: '',
      tags: [],
    });
    postMock.mockResolvedValue({ id: 'article-created-1' });
    scoreSeoMock.mockResolvedValue({
      category: 'post',
      content: '',
      id: 'article-1',
      label: 'Existing article',
      seoScore: 82,
      slug: 'existing-article',
      status: ArticleStatus.DRAFT,
      summary: '',
      tags: [],
    });
    getArticlesServiceMock.mockResolvedValue(articlesServiceMock);
  });

  it('returns required fields', () => {
    const { result } = renderHook(() => useArticleDetail({}));
    expect(result.current).toHaveProperty('article');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isSaving');
    expect(result.current).toHaveProperty('isEnhancing');
    expect(result.current).toHaveProperty('isScoringSeo');
    expect(result.current).toHaveProperty('isDirty');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('form');
    expect(result.current).toHaveProperty('setFormField');
    expect(result.current).toHaveProperty('handleSave');
    expect(result.current).toHaveProperty('handlePublish');
    expect(result.current).toHaveProperty('handleArchive');
    expect(result.current).toHaveProperty('handleDelete');
    expect(result.current).toHaveProperty('handleEnhance');
    expect(result.current).toHaveProperty('handleScoreSeo');
  });

  it('initializes with null article', () => {
    const { result } = renderHook(() => useArticleDetail({}));
    expect(result.current.article).toBeNull();
  });

  it('initializes with isLoading true when articleId is provided', async () => {
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('initializes form with default values', () => {
    const { result } = renderHook(() => useArticleDetail({}));
    expect(result.current.form).toHaveProperty('content');
    expect(result.current.form).toHaveProperty('label');
    expect(result.current.form).toHaveProperty('status');
    expect(result.current.form.content).toBe('');
    expect(result.current.form.label).toBe('');
    expect(result.current.form.status).toBe(ArticleStatus.DRAFT);
  });

  it('all handlers are functions', () => {
    const { result } = renderHook(() => useArticleDetail({}));
    expect(typeof result.current.handleSave).toBe('function');
    expect(typeof result.current.handlePublish).toBe('function');
    expect(typeof result.current.handleArchive).toBe('function');
    expect(typeof result.current.handleDelete).toBe('function');
    expect(typeof result.current.handleEnhance).toBe('function');
    expect(typeof result.current.handleScoreSeo).toBe('function');
    expect(typeof result.current.setFormField).toBe('function');
  });

  it('scores SEO for the current article', async () => {
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handleScoreSeo();
    });

    expect(scoreSeoMock).toHaveBeenCalledWith('article-1');
    expect(result.current.article?.seoScore).toBe(82);
    expect(notificationsServiceMock.success).toHaveBeenCalledWith(
      'SEO score updated',
    );
  });

  it('navigates to the scoped article editor after creating a new article', async () => {
    const { result } = renderHook(() => useArticleDetail({}));

    act(() => {
      result.current.setFormField('label', 'New article');
      result.current.setFormField('content', 'Body copy');
      result.current.setFormField('summary', 'Summary');
    });

    await act(async () => {
      await result.current.handleSave();
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        '/genfeed-ai/paperclip/publishing/posts/article-created-1',
      );
    });
  });

  it('loads an existing article into the form', async () => {
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(findOneMock).toHaveBeenCalledWith('article-1');
    expect(result.current.form.label).toBe('Existing article');
    expect(result.current.form.slug).toBe('existing-article');
    expect(result.current.isDirty).toBe(false);
  });

  it('reports an error when the article fails to load', async () => {
    findOneMock.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load article');
    expect(notificationsServiceMock.error).toHaveBeenCalledWith(
      'Failed to load article',
    );
  });

  it('auto-generates a slug for new articles and marks the form dirty', () => {
    const { result } = renderHook(() => useArticleDetail({}));

    act(() => {
      result.current.setFormField('label', 'Hello, World!  Article');
    });

    expect(result.current.form.slug).toBe('hello-world-article');
    expect(result.current.isDirty).toBe(true);
  });

  it('does not regenerate the slug when editing an existing article', async () => {
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setFormField('label', 'Renamed Article');
    });

    expect(result.current.form.slug).toBe('existing-article');
  });

  it('patches an existing article on save', async () => {
    patchMock.mockResolvedValue({ id: 'article-1', label: 'Renamed' });
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setFormField('label', 'Renamed');
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(patchMock).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ label: 'Renamed' }),
    );
    expect(notificationsServiceMock.success).toHaveBeenCalledWith(
      'Article saved',
    );
    expect(result.current.isDirty).toBe(false);
  });

  it('notifies when saving fails', async () => {
    patchMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(notificationsServiceMock.error).toHaveBeenCalledWith(
      'Failed to save article',
    );
    expect(result.current.isSaving).toBe(false);
  });

  it('publishes the article and stores ArticleStatus.PUBLISHED', async () => {
    publishMock.mockResolvedValue({
      id: 'article-1',
      status: ArticleStatus.PUBLISHED,
    });
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handlePublish();
    });

    expect(publishMock).toHaveBeenCalledWith('article-1');
    expect(result.current.form.status).toBe(ArticleStatus.PUBLISHED);
    expect(result.current.form.status).not.toBe('public');
    expect(result.current.form.status).not.toBe('published');
    expect(notificationsServiceMock.success).toHaveBeenCalledWith(
      'Article published',
    );
  });

  it('keeps PUBLISHED after publish even if the API echoes a legacy status', async () => {
    publishMock.mockResolvedValue({ id: 'article-1', status: 'public' });
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handlePublish();
    });

    expect(result.current.form.status).toBe(ArticleStatus.PUBLISHED);
    expect(result.current.form.status).not.toBe('public');
  });

  it('archives the article and stores ArticleStatus.ARCHIVED', async () => {
    archiveMock.mockResolvedValue({
      id: 'article-1',
      status: ArticleStatus.ARCHIVED,
    });
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handleArchive();
    });

    expect(archiveMock).toHaveBeenCalledWith('article-1');
    expect(result.current.form.status).toBe(ArticleStatus.ARCHIVED);
    expect(result.current.form.status).not.toBe('archived');
  });

  it('deletes the article and navigates to publish', async () => {
    deleteMock.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(deleteMock).toHaveBeenCalledWith('article-1');
    expect(pushMock).toHaveBeenCalled();
  });

  it('notifies when deleting fails', async () => {
    deleteMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(notificationsServiceMock.error).toHaveBeenCalledWith(
      'Failed to delete article',
    );
  });

  it('enhances the article and adopts the returned content', async () => {
    enhanceMock.mockResolvedValue({
      category: 'post',
      content: 'Enhanced body',
      id: 'article-1',
      label: 'Enhanced label',
      slug: 'existing-article',
      status: ArticleStatus.DRAFT,
      summary: 'Enhanced summary',
    });
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handleEnhance('make it better');
    });

    expect(enhanceMock).toHaveBeenCalledWith('article-1', 'make it better');
    expect(result.current.form.content).toBe('Enhanced body');
    expect(result.current.form.label).toBe('Enhanced label');
    expect(result.current.isDirty).toBe(false);
    expect(notificationsServiceMock.success).toHaveBeenCalledWith(
      'Article enhanced',
    );
  });

  it('notifies when enhancement fails', async () => {
    enhanceMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handleEnhance('prompt');
    });

    expect(notificationsServiceMock.error).toHaveBeenCalledWith(
      'Failed to enhance article',
    );
    expect(result.current.isEnhancing).toBe(false);
  });

  it('skips SEO scoring while the form is dirty', async () => {
    const { result } = renderHook(() =>
      useArticleDetail({ articleId: 'article-1' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setFormField('content', 'edited');
    });

    await act(async () => {
      await result.current.handleScoreSeo();
    });

    expect(scoreSeoMock).not.toHaveBeenCalled();
  });

  it('ignores publish, archive, delete, and enhance without an id', async () => {
    const { result } = renderHook(() => useArticleDetail({}));

    await act(async () => {
      await result.current.handlePublish();
      await result.current.handleArchive();
      await result.current.handleDelete();
      await result.current.handleEnhance('prompt');
      await result.current.handleScoreSeo();
    });

    expect(publishMock).not.toHaveBeenCalled();
    expect(archiveMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(enhanceMock).not.toHaveBeenCalled();
    expect(scoreSeoMock).not.toHaveBeenCalled();
  });
});
