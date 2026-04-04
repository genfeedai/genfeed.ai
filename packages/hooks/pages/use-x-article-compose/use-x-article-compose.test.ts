import { useXArticleCompose } from '@hooks/pages/use-x-article-compose/use-x-article-compose';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
  })),
}));

vi.mock('@helpers/media/download/download.helper', () => ({
  downloadUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@services/content/articles.service', () => ({
  ArticlesService: {
    getInstance: vi.fn(() => ({
      generateArticles: vi.fn().mockResolvedValue({
        id: 'article-1',
        xArticleMetadata: { title: 'Test Article' },
      }),
    })),
  },
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: vi.fn(() => ({
      copy: vi.fn(),
    })),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('useXArticleCompose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns required fields', () => {
    const { result } = renderHook(() => useXArticleCompose());
    expect(result.current).toHaveProperty('phase');
    expect(result.current).toHaveProperty('article');
    expect(result.current).toHaveProperty('metadata');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('isGeneratingImage');
    expect(result.current).toHaveProperty('handleGenerate');
    expect(result.current).toHaveProperty('handleCopySection');
    expect(result.current).toHaveProperty('handleCopyFullArticle');
    expect(result.current).toHaveProperty('handleDownloadImage');
    expect(result.current).toHaveProperty('handleGenerateHeaderImage');
  });

  it('initializes with idle phase', () => {
    const { result } = renderHook(() => useXArticleCompose());
    expect(result.current.phase).toBe('idle');
  });

  it('initializes with null article and metadata', () => {
    const { result } = renderHook(() => useXArticleCompose());
    expect(result.current.article).toBeNull();
    expect(result.current.metadata).toBeNull();
  });

  it('initializes with null error and isGeneratingImage false', () => {
    const { result } = renderHook(() => useXArticleCompose());
    expect(result.current.error).toBeNull();
    expect(result.current.isGeneratingImage).toBe(false);
  });

  it('all returned handlers are functions', () => {
    const { result } = renderHook(() => useXArticleCompose());
    expect(typeof result.current.handleGenerate).toBe('function');
    expect(typeof result.current.handleCopySection).toBe('function');
    expect(typeof result.current.handleCopyFullArticle).toBe('function');
    expect(typeof result.current.handleDownloadImage).toBe('function');
    expect(typeof result.current.handleGenerateHeaderImage).toBe('function');
  });

  it('handleDownloadImage calls downloadUrl', async () => {
    const { downloadUrl } = await import(
      '@helpers/media/download/download.helper'
    );
    const { result } = renderHook(() => useXArticleCompose());
    act(() => {
      result.current.handleDownloadImage(
        'https://example.com/img.png',
        'test.png',
      );
    });
    expect(downloadUrl).toHaveBeenCalledWith(
      'https://example.com/img.png',
      'test.png',
    );
  });
});
