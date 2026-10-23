import { IngredientStatus } from '@genfeedai/contracts';
import type { MediaDeliveryGrant } from '@genfeedai/contracts/interfaces';
import {
  isStudioPreviewPending,
  useStudioPendingPreviews,
} from '@pages/studio/playground/hooks/useStudioPendingPreviews';
import type { StudioPlaygroundJob } from '@pages/studio/playground/types';
import type { IngredientsService } from '@services/content/ingredients.service';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function grant(
  state: MediaDeliveryGrant['state'],
  url: string | null = null,
): MediaDeliveryGrant {
  return { expiresAt: null, id: 'ing-1', purpose: 'preview', state, url };
}

const pendingJob = {
  createdAt: 1,
  id: 'job-1',
  ingredient: { id: 'ing-1', mediaDelivery: grant('PENDING') },
  ingredientId: 'ing-1',
  prompt: 'Saved image',
  status: IngredientStatus.GENERATED,
  type: 'image',
} as unknown as StudioPlaygroundJob;

function renderPreviews(
  previewGrant: ReturnType<typeof vi.fn>,
  jobs: readonly StudioPlaygroundJob[] = [pendingJob],
) {
  const recoverPreview = vi.fn();
  const service = { previewGrant } as unknown as IngredientsService;
  const getIngredientsService = vi.fn().mockResolvedValue(service);
  const view = renderHook(() =>
    useStudioPendingPreviews({ getIngredientsService, jobs, recoverPreview }),
  );
  return { ...view, getIngredientsService, recoverPreview };
}

afterEach(() => vi.useRealTimers());

describe('isStudioPreviewPending', () => {
  it('flags a saved asset whose preview is still being prepared', () => {
    expect(isStudioPreviewPending(pendingJob)).toBe(true);
  });

  it('ignores assets that already have a URL, are still generating or failed', () => {
    expect(
      isStudioPreviewPending({ ...pendingJob, url: 'https://cdn/p.png' }),
    ).toBe(false);
    expect(
      isStudioPreviewPending({
        ...pendingJob,
        status: IngredientStatus.PROCESSING,
      }),
    ).toBe(false);
    expect(
      isStudioPreviewPending({
        ...pendingJob,
        status: IngredientStatus.FAILED,
      }),
    ).toBe(false);
  });
});

describe('useStudioPendingPreviews', () => {
  it('hands the ready preview back to the card once the API issues it', async () => {
    vi.useFakeTimers();
    const previewGrant = vi
      .fn()
      .mockResolvedValueOnce(grant('PENDING'))
      .mockResolvedValue(grant('READY', 'https://cdn/ready.png'));
    const { recoverPreview } = renderPreviews(previewGrant);

    await vi.advanceTimersByTimeAsync(0);
    expect(recoverPreview).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4_000);

    expect(previewGrant).toHaveBeenCalledTimes(2);
    expect(previewGrant).toHaveBeenCalledWith('ing-1', expect.any(AbortSignal));
    expect(recoverPreview).toHaveBeenCalledWith(
      pendingJob,
      'https://cdn/ready.png',
    );
  });

  it('stops asking once the API reports the preview failed', async () => {
    vi.useFakeTimers();
    const previewGrant = vi.fn().mockResolvedValue(grant('FAILED'));
    const { recoverPreview } = renderPreviews(previewGrant);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(previewGrant).toHaveBeenCalledTimes(1);
    expect(recoverPreview).not.toHaveBeenCalled();
  });

  it('does not poll when nothing is pending, and stops on unmount', async () => {
    vi.useFakeTimers();
    const idle = vi.fn();
    renderPreviews(idle, [{ ...pendingJob, url: 'https://cdn/p.png' }]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(idle).not.toHaveBeenCalled();

    const previewGrant = vi.fn().mockResolvedValue(grant('PENDING'));
    const { unmount } = renderPreviews(previewGrant);
    await vi.advanceTimersByTimeAsync(0);
    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(previewGrant).toHaveBeenCalledTimes(1);
  });
});
