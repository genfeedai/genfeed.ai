import { useGalleryList } from '@hooks/data/gallery/use-gallery-list/use-gallery-list';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: vi.fn(() => ({
      findPublicArticles: vi.fn().mockResolvedValue([]),
      findPublicImages: vi.fn().mockResolvedValue([]),
      findPublicMusics: vi.fn().mockResolvedValue([]),
      findPublicPosts: vi.fn().mockResolvedValue([]),
      findPublicVideos: vi.fn().mockResolvedValue([]),
    })),
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => ({
    get: vi.fn((key: string) => (key === 'page' ? '1' : null)),
  })),
}));

describe('useGalleryList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns items, isLoading, page, and refetch', () => {
    const { result } = renderHook(() => useGalleryList({ type: 'images' }));
    expect(result.current).toHaveProperty('items');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('page');
    expect(result.current).toHaveProperty('refetch');
  });

  it('initializes with empty items array', () => {
    const { result } = renderHook(() => useGalleryList({ type: 'images' }));
    expect(Array.isArray(result.current.items)).toBe(true);
  });

  it('initializes isLoading as true', () => {
    const { result } = renderHook(() => useGalleryList({ type: 'videos' }));
    expect(result.current.isLoading).toBe(true);
  });

  it('returns page from search params', () => {
    const { result } = renderHook(() => useGalleryList({ type: 'images' }));
    expect(result.current.page).toBe(1);
  });

  it('refetch is a function', () => {
    const { result } = renderHook(() => useGalleryList({ type: 'posts' }));
    expect(typeof result.current.refetch).toBe('function');
  });
});
