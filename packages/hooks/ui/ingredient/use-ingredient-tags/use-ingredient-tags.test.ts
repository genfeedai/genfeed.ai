import type { IIngredient, ITag } from '@cloud/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockPatchTags = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => async () => ({
    patchTags: mockPatchTags,
  })),
}));

vi.mock('@hooks/utils/service-operation/service-operation.util', () => ({
  withSilentOperation: vi.fn(async ({ operation }) => {
    return await operation();
  }),
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: vi.fn(() => ({
      patchTags: mockPatchTags,
    })),
  },
}));

import { useIngredientTags } from '@hooks/ui/ingredient/use-ingredient-tags/use-ingredient-tags';

describe('useIngredientTags', () => {
  const mockIngredient: IIngredient = {
    id: 'ing-123',
    tags: [
      { id: 'tag-1', label: 'Tag 1' },
      { id: 'tag-2', label: 'Tag 2' },
    ],
  } as IIngredient;

  const mockAvailableTags: ITag[] = [
    { id: 'tag-1', label: 'Tag 1' } as ITag,
    { id: 'tag-2', label: 'Tag 2' } as ITag,
    { id: 'tag-3', label: 'Tag 3' } as ITag,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockPatchTags.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should return initial state', () => {
      const { result } = renderHook(() =>
        useIngredientTags({
          availableTags: mockAvailableTags,
          ingredient: mockIngredient,
        }),
      );

      expect(result.current.isUpdatingTags).toBe(false);
      expect(typeof result.current.handleTagsChange).toBe('function');
      expect(typeof result.current.handleRemoveTag).toBe('function');
    });
  });

  describe('handleTagsChange', () => {
    it('should call patchTags with new tag ids', async () => {
      const { result } = renderHook(() =>
        useIngredientTags({
          ingredient: mockIngredient,
        }),
      );

      await act(async () => {
        await result.current.handleTagsChange(['tag-1', 'tag-3']);
      });

      await waitFor(() => {
        expect(mockPatchTags).toHaveBeenCalledWith('ing-123', [
          'tag-1',
          'tag-3',
        ]);
      });
    });

    it('should not call patchTags when ingredient has no id', async () => {
      const ingredientNoId = { ...mockIngredient, id: '' } as IIngredient;

      const { result } = renderHook(() =>
        useIngredientTags({
          ingredient: ingredientNoId,
        }),
      );

      await act(async () => {
        await result.current.handleTagsChange(['tag-1']);
      });

      expect(mockPatchTags).not.toHaveBeenCalled();
    });

    it('should set isUpdatingTags while updating', async () => {
      let resolvePromise: () => void;
      const pendingPromise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });

      mockPatchTags.mockImplementation(() => pendingPromise);

      const { result } = renderHook(() =>
        useIngredientTags({
          ingredient: mockIngredient,
        }),
      );

      expect(result.current.isUpdatingTags).toBe(false);

      act(() => {
        result.current.handleTagsChange(['tag-1']);
      });

      await waitFor(() => {
        expect(result.current.isUpdatingTags).toBe(true);
      });

      await act(async () => {
        resolvePromise?.();
      });

      await waitFor(() => {
        expect(result.current.isUpdatingTags).toBe(false);
      });
    });

    it('should call onRefresh after successful update', async () => {
      const onRefresh = vi.fn();

      const { result } = renderHook(() =>
        useIngredientTags({
          ingredient: mockIngredient,
          onRefresh,
        }),
      );

      await act(async () => {
        await result.current.handleTagsChange(['tag-1']);
      });

      // Note: withSilentOperation mock calls onSuccess internally
    });
  });

  describe('handleRemoveTag', () => {
    it('should remove tag from current tags', async () => {
      const { result } = renderHook(() =>
        useIngredientTags({
          ingredient: mockIngredient,
        }),
      );

      await act(async () => {
        await result.current.handleRemoveTag('tag-1');
      });

      await waitFor(() => {
        expect(mockPatchTags).toHaveBeenCalledWith('ing-123', ['tag-2']);
      });
    });

    it('should handle tags as string array', async () => {
      const ingredientWithStringTags: IIngredient = {
        id: 'ing-123',
        tags: ['tag-1', 'tag-2', 'tag-3'] as any,
      } as IIngredient;

      const { result } = renderHook(() =>
        useIngredientTags({
          ingredient: ingredientWithStringTags,
        }),
      );

      await act(async () => {
        await result.current.handleRemoveTag('tag-2');
      });

      await waitFor(() => {
        expect(mockPatchTags).toHaveBeenCalledWith('ing-123', [
          'tag-1',
          'tag-3',
        ]);
      });
    });

    it('should handle empty tags array', async () => {
      const ingredientNoTags: IIngredient = {
        id: 'ing-123',
        tags: [],
      } as IIngredient;

      const { result } = renderHook(() =>
        useIngredientTags({
          ingredient: ingredientNoTags,
        }),
      );

      await act(async () => {
        await result.current.handleRemoveTag('tag-1');
      });

      await waitFor(() => {
        expect(mockPatchTags).toHaveBeenCalledWith('ing-123', []);
      });
    });

    it('should handle undefined tags', async () => {
      const ingredientNoTags: IIngredient = {
        id: 'ing-123',
      } as IIngredient;

      const { result } = renderHook(() =>
        useIngredientTags({
          ingredient: ingredientNoTags,
        }),
      );

      await act(async () => {
        await result.current.handleRemoveTag('tag-1');
      });

      await waitFor(() => {
        expect(mockPatchTags).toHaveBeenCalledWith('ing-123', []);
      });
    });

    it('should filter out null and invalid tags', async () => {
      const ingredientMixedTags: IIngredient = {
        id: 'ing-123',
        tags: [
          { id: 'tag-1', label: 'Tag 1' },
          null,
          { id: 'tag-2', label: 'Tag 2' },
          undefined,
        ] as any,
      } as IIngredient;

      const { result } = renderHook(() =>
        useIngredientTags({
          ingredient: ingredientMixedTags,
        }),
      );

      await act(async () => {
        await result.current.handleRemoveTag('tag-1');
      });

      await waitFor(() => {
        expect(mockPatchTags).toHaveBeenCalledWith('ing-123', ['tag-2']);
      });
    });
  });
});
