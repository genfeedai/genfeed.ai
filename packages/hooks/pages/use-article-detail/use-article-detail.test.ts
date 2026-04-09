import { useArticleDetail } from '@hooks/pages/use-article-detail/use-article-detail';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const postMock = vi.fn();
const findOneMock = vi.fn();
const notificationsServiceMock = {
  error: vi.fn(),
  success: vi.fn(),
};
const articlesServiceMock = {
  findOne: findOneMock,
  post: postMock,
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
      status: 'draft',
      summary: '',
      tags: [],
    });
    postMock.mockResolvedValue({ id: 'article-created-1' });
    getArticlesServiceMock.mockResolvedValue(articlesServiceMock);
  });

  it('returns required fields', () => {
    const { result } = renderHook(() => useArticleDetail({}));
    expect(result.current).toHaveProperty('article');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isSaving');
    expect(result.current).toHaveProperty('isEnhancing');
    expect(result.current).toHaveProperty('isDirty');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('form');
    expect(result.current).toHaveProperty('setFormField');
    expect(result.current).toHaveProperty('handleSave');
    expect(result.current).toHaveProperty('handlePublish');
    expect(result.current).toHaveProperty('handleArchive');
    expect(result.current).toHaveProperty('handleDelete');
    expect(result.current).toHaveProperty('handleEnhance');
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
  });

  it('all handlers are functions', () => {
    const { result } = renderHook(() => useArticleDetail({}));
    expect(typeof result.current.handleSave).toBe('function');
    expect(typeof result.current.handlePublish).toBe('function');
    expect(typeof result.current.handleArchive).toBe('function');
    expect(typeof result.current.handleDelete).toBe('function');
    expect(typeof result.current.handleEnhance).toBe('function');
    expect(typeof result.current.setFormField).toBe('function');
  });

  it('navigates to the generic composer route after creating a new article', async () => {
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
        '/compose/article?id=article-created-1',
      );
    });
  });
});
