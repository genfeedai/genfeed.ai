import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { IVideoRepostVariantParams } from '@genfeedai/contracts/interfaces/components/video-operations.interface';
import { useIngredientServices } from '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services';
import { useRepostVariant } from '@hooks/ui/ingredient/use-repost-variant/use-repost-variant';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: Array<{ id: string; params: IVideoRepostVariantParams }> = [];
const notices: string[] = [];

vi.mock(
  '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services',
  () => ({ useIngredientServices: vi.fn() }),
);

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: (message: string) => notices.push(`error: ${message}`),
      success: (message: string) => notices.push(`success: ${message}`),
    }),
  },
}));

vi.mock('@genfeedai/utils/media/ingredient-type.util', () => ({
  isVideoIngredient: (ingredient: IIngredient) =>
    ingredient.category === IngredientCategory.VIDEO,
}));

const video = {
  category: IngredientCategory.VIDEO,
  id: 'video-1',
} as IIngredient;
const image = {
  category: IngredientCategory.IMAGE,
  id: 'image-1',
} as IIngredient;

describe('useRepostVariant', () => {
  beforeEach(() => {
    sent.length = 0;
    notices.length = 0;
    vi.mocked(useIngredientServices).mockReturnValue({
      getVideosService: async () => ({
        postRepostVariant: async (
          id: string,
          params: IVideoRepostVariantParams,
        ) => {
          sent.push({ id, params });
        },
      }),
    } as unknown as ReturnType<typeof useIngredientServices>);
  });

  it('holds the video until the picks are sent, then refreshes and closes', async () => {
    let refreshes = 0;
    const { result } = renderHook(() =>
      useRepostVariant({
        onRefresh: () => {
          refreshes += 1;
        },
      }),
    );

    act(() => result.current.handleRepostVariant(video));
    expect(result.current.repostVariantIngredient?.id).toBe('video-1');
    expect(sent).toEqual([]);

    await act(async () => {
      await result.current.executeRepostVariant({
        isMirrored: true,
        speed: 1.1,
      });
    });

    expect(sent).toEqual([
      { id: 'video-1', params: { isMirrored: true, speed: 1.1 } },
    ]);
    expect(refreshes).toBe(1);
    expect(result.current.repostVariantIngredient).toBeNull();
    expect(notices).toEqual([
      'success: Repost variant started. It will appear as a version.',
    ]);
  });

  it('closes without sending anything', () => {
    const { result } = renderHook(() => useRepostVariant());

    act(() => result.current.handleRepostVariant(video));
    act(() => result.current.clearRepostVariant());

    expect(result.current.repostVariantIngredient).toBeNull();
    expect(sent).toEqual([]);
  });

  it('refuses an image', () => {
    const { result } = renderHook(() => useRepostVariant());

    act(() => result.current.handleRepostVariant(image));

    expect(result.current.repostVariantIngredient).toBeNull();
    expect(notices).toEqual(['error: Can only make variants of videos']);
  });
});
