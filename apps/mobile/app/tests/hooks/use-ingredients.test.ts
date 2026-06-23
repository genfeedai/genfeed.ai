import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ingredient } from '@/services/api/ingredients.service';

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

// Mock the ingredients service
vi.mock('@/services/api/ingredients.service', () => ({
  ingredientsService: {
    findAll: vi.fn(),
    findOne: vi.fn(),
  },
}));

import { useMobileAuth } from '@/contexts/auth-context';
import { useIngredient, useIngredients } from '@/hooks/use-ingredients';
import { ingredientsService } from '@/services/api/ingredients.service';

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
    const mockIngredients: Ingredient[] = [
      {
        attributes: {
          category: 'image',
          createdAt: '',
          status: 'active',
          updatedAt: '',
        },
        id: '1',
        type: 'attributes',
      },
    ];
    vi.mocked(ingredientsService.findAll).mockResolvedValue({
      data: mockIngredients,
    });

    const { result } = renderHook(() => useIngredients());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.ingredients).toEqual(mockIngredients);
    expect(ingredientsService.findAll).toHaveBeenCalledWith('test-token', {});
  });

  it('should pass options to service', async () => {
    vi.mocked(ingredientsService.findAll).mockResolvedValue({ data: [] });

    const options = { category: 'video' as const, page: 2, pageSize: 20 };
    renderHook(() => useIngredients(options));

    await waitFor(() => {
      expect(ingredientsService.findAll).toHaveBeenCalledWith(
        'test-token',
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
    const { result } = renderHook(() => useIngredient(null));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.ingredient).toBeNull();
    expect(ingredientsService.findOne).not.toHaveBeenCalled();
  });

  it('should fetch ingredient when id is provided', async () => {
    const mockIngredient: Ingredient = {
      attributes: {
        category: 'image',
        createdAt: '',
        status: 'active',
        updatedAt: '',
      },
      id: '123',
      type: 'attributes',
    };
    vi.mocked(ingredientsService.findOne).mockResolvedValue({
      data: mockIngredient,
    });

    const { result } = renderHook(() => useIngredient('123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.ingredient).toEqual(mockIngredient);
    expect(ingredientsService.findOne).toHaveBeenCalledWith(
      'test-token',
      '123',
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

    const { result } = renderHook(() => useIngredient('123'));

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

    const { result } = renderHook(() => useIngredient('123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe('Not found');
  });
});
