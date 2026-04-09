import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useIngredientMetadata } from '@hooks/ui/ingredient/use-ingredient-metadata/use-ingredient-metadata';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(),
  },
}));

describe('useIngredientMetadata', () => {
  const baseIngredient: IIngredient = {
    category: 'video',
    id: 'ingredient-1',
    metadata: { label: 'Original' } as IMetadata,
    status: 'validated',
  } as IIngredient;

  let mockIngredientsService: {
    patchMetadata: ReturnType<typeof vi.fn>;
  };
  let mockGetIngredientsService: ReturnType<typeof vi.fn>;
  let mockNotificationsService: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockIngredientsService = {
      patchMetadata: vi.fn().mockResolvedValue(undefined),
    };

    mockGetIngredientsService = vi
      .fn()
      .mockResolvedValue(mockIngredientsService);

    mockNotificationsService = {
      error: vi.fn(),
      success: vi.fn(),
    };

    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetIngredientsService,
    );

    (
      NotificationsService.getInstance as ReturnType<typeof vi.fn>
    ).mockReturnValue(mockNotificationsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with isUpdating false', () => {
    const { result } = renderHook(() => useIngredientMetadata(baseIngredient));

    expect(result.current.isUpdating).toBe(false);
  });

  it('requires ingredient id', async () => {
    const { result } = renderHook(() => useIngredientMetadata(null));

    await act(async () => {
      await result.current.updateMetadata('label', 'Updated');
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Ingredient ID is required',
    );
    expect(mockGetIngredientsService).not.toHaveBeenCalled();
  });

  it('requires metadata to exist', async () => {
    const ingredient = {
      ...baseIngredient,
      metadata: undefined,
    } as IIngredient;
    const { result } = renderHook(() => useIngredientMetadata(ingredient));

    await act(async () => {
      await result.current.updateMetadata('label', 'Updated');
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Ingredient does not have metadata',
    );
  });

  it('rejects invalid metadata formats', async () => {
    const ingredient = {
      ...baseIngredient,
      metadata: 'invalid',
    } as IIngredient;
    const { result } = renderHook(() => useIngredientMetadata(ingredient));

    await act(async () => {
      await result.current.updateMetadata('label', 'Updated');
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Invalid metadata format',
    );
  });

  it('updates metadata and triggers callbacks', async () => {
    const onUpdate = vi.fn();
    const onReload = vi.fn().mockResolvedValue({
      ...baseIngredient,
      metadata: { label: 'Updated' },
    });

    const { result } = renderHook(() =>
      useIngredientMetadata(baseIngredient, onUpdate, onReload),
    );

    await act(async () => {
      await result.current.updateMetadata('label', 'Updated');
    });

    expect(mockGetIngredientsService).toHaveBeenCalled();
    expect(mockIngredientsService.patchMetadata).toHaveBeenCalledWith(
      'ingredient-1',
      { label: 'Updated' },
    );
    expect(mockNotificationsService.success).toHaveBeenCalledWith(
      'Updated successfully',
    );
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ingredient-1',
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'PATCH /ingredients/ingredient-1/metadata [label] success',
      expect.objectContaining({
        id: 'ingredient-1',
      }),
    );
  });

  it('handles update failures', async () => {
    mockIngredientsService.patchMetadata.mockRejectedValue(
      new Error('Update failed'),
    );

    const { result } = renderHook(() => useIngredientMetadata(baseIngredient));

    await expect(async () => {
      await act(async () => {
        await result.current.updateMetadata('label', 'Updated');
      });
    }).rejects.toThrow('Update failed');

    expect(logger.error).toHaveBeenCalledWith(
      'PATCH /ingredients/ingredient-1/metadata [label] failed',
      expect.any(Error),
    );
    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Failed to update',
    );
    expect(result.current.isUpdating).toBe(false);
  });
});
