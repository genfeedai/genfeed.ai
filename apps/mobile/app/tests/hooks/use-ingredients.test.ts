import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryDetail } from '@/services/api/ingredients.service';

vi.mock('@/contexts/auth-context', () => ({
  useMobileAuth: vi.fn(() => ({
    getToken: vi.fn().mockResolvedValue('test-token'),
    isLoaded: true,
    isSignedIn: true,
    refreshSession: vi.fn(),
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
    user: null,
  })),
}));

vi.mock('@/services/api/request-scope', () => ({
  loadRequestScope: vi.fn(async () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
  })),
}));

vi.mock('@/services/api/ingredients.service', () => ({
  ingredientsService: {
    findAll: vi.fn(),
    findOne: vi.fn(),
  },
}));

import { useMobileAuth } from '@/contexts/auth-context';
import { useIngredient, useIngredients } from '@/hooks/use-ingredients';
import { ingredientsService } from '@/services/api/ingredients.service';
import { loadRequestScope } from '@/services/api/request-scope';

const scope = { brandId: 'brand-1', organizationId: 'org-1' };

describe('useIngredients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
  });

  it('should return initial loading state', () => {
    vi.mocked(ingredientsService.findAll).mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useIngredients());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.ingredients).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('should fetch ingredients on mount', async () => {
    const items = [{ id: '1' }];
    vi.mocked(ingredientsService.findAll).mockResolvedValue({ data: items });

    const { result } = renderHook(() => useIngredients());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.ingredients).toEqual(items);
    expect(ingredientsService.findAll).toHaveBeenCalledWith(
      'test-token',
      scope,
      {},
    );
  });

  it('should pass options to service', async () => {
    vi.mocked(ingredientsService.findAll).mockResolvedValue({ data: [] });

    const options = { category: 'video' as const, limit: 20, page: 2 };
    renderHook(() => useIngredients(options));

    await waitFor(() => {
      expect(ingredientsService.findAll).toHaveBeenCalledWith(
        'test-token',
        scope,
        options,
      );
    });
  });

  it('should handle error when token is not available', async () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue(null),
      isLoaded: true,
      isSignedIn: false,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);

    const { result } = renderHook(() => useIngredients());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe(
      'No authentication token available',
    );
    expect(loadRequestScope).not.toHaveBeenCalled();
  });

  it('should handle API errors', async () => {
    vi.mocked(ingredientsService.findAll).mockRejectedValue(
      new Error('API Error'),
    );

    const { result } = renderHook(() => useIngredients());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe('API Error');
  });

  it('should provide refetch function', async () => {
    vi.mocked(ingredientsService.findAll).mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useIngredients());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');
    const initialCallCount = vi.mocked(ingredientsService.findAll).mock.calls
      .length;

    await act(async () => {
      await result.current.refetch();
    });

    expect(vi.mocked(ingredientsService.findAll).mock.calls.length).toBe(
      initialCallCount + 1,
    );
  });
});

describe('useIngredient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue('test-token'),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
  });

  it('should return null when id is null', async () => {
    const { result } = renderHook(() => useIngredient(null, 'image'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.detail).toBeNull();
    expect(ingredientsService.findOne).not.toHaveBeenCalled();
  });

  it('should refuse a detail load that has no content type', async () => {
    const { result } = renderHook(() => useIngredient('123', null));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe(
      'A content type is required to load this item.',
    );
    expect(ingredientsService.findOne).not.toHaveBeenCalled();
  });

  it('should fetch an image when id and category are provided', async () => {
    const detail = {
      item: { id: '123' },
      kind: 'media',
    } satisfies LibraryDetail;
    vi.mocked(ingredientsService.findOne).mockResolvedValue({ data: detail });

    const { result } = renderHook(() => useIngredient('123', 'image'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.detail).toEqual(detail);
    expect(ingredientsService.findOne).toHaveBeenCalledWith(
      'test-token',
      scope,
      '123',
      'image',
    );
  });

  it('should handle error when token is not available', async () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn().mockResolvedValue(null),
      isLoaded: true,
      isSignedIn: false,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);

    const { result } = renderHook(() => useIngredient('123', 'image'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe(
      'No authentication token available',
    );
  });

  it('should handle API errors', async () => {
    vi.mocked(ingredientsService.findOne).mockRejectedValue(
      new Error('Not found'),
    );

    const { result } = renderHook(() => useIngredient('123', 'image'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe('Not found');
  });
});
