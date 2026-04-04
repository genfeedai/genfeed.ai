import type { IIngredient } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useIngredientSharing } from '@hooks/ui/ingredient/use-ingredient-sharing/use-ingredient-sharing';
import { executeWithLoading } from '@hooks/utils/service-operation/service-operation.util';
import { NotificationsService } from '@services/core/notifications.service';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock('@hooks/utils/service-operation/service-operation.util', () => ({
  executeWithLoading: vi.fn(),
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(),
  },
}));

describe('useIngredientSharing', () => {
  const baseIngredient: IIngredient = {
    category: 'image',
    id: 'ingredient-1',
    status: 'validated',
  } as IIngredient;

  let mockIngredientsService: {
    patch: ReturnType<typeof vi.fn>;
  };
  let mockGetIngredientsService: ReturnType<typeof vi.fn>;
  let mockNotificationsService: {
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockIngredientsService = {
      patch: vi.fn().mockResolvedValue(undefined),
    };

    mockGetIngredientsService = vi
      .fn()
      .mockResolvedValue(mockIngredientsService);

    mockNotificationsService = {
      error: vi.fn(),
    };

    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetIngredientsService,
    );

    (
      NotificationsService.getInstance as ReturnType<typeof vi.fn>
    ).mockReturnValue(mockNotificationsService);

    (executeWithLoading as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with isUpdating false', () => {
    const { result } = renderHook(() => useIngredientSharing(baseIngredient));

    expect(result.current.isUpdating).toBe(false);
  });

  it('requires ingredient id before updating', async () => {
    const { result } = renderHook(() => useIngredientSharing(null));

    await act(async () => {
      await result.current.updateSharing('scope', 'public');
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Ingredient ID is required',
    );
    expect(executeWithLoading).not.toHaveBeenCalled();
  });

  it('uses executeWithLoading to update sharing', async () => {
    const onUpdate = vi.fn();
    const { result } = renderHook(() =>
      useIngredientSharing(baseIngredient, onUpdate),
    );

    await act(async () => {
      await result.current.updateSharing('scope', 'public');
    });

    expect(mockGetIngredientsService).toHaveBeenCalled();
    expect(executeWithLoading).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Failed to update sharing settings',
        onSuccess: onUpdate,
        rethrow: true,
        successMessage: 'Sharing settings updated',
        url: 'PATCH /ingredients/ingredient-1 [scope]',
      }),
    );

    const callArgs = (executeWithLoading as ReturnType<typeof vi.fn>).mock
      .calls[0][0];

    await callArgs.operation();

    expect(mockIngredientsService.patch).toHaveBeenCalledWith('ingredient-1', {
      scope: 'public',
    });
  });
});
