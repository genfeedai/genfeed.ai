import { IngredientStatus } from '@genfeedai/contracts';
import type { MediaDeliveryGrant } from '@genfeedai/contracts/interfaces';
import { Image } from '@genfeedai/models/ingredients/image.model';
import {
  isStudioPreviewPending,
  useStudioPendingPreviews,
} from '@pages/studio/playground/hooks/useStudioPendingPreviews';
import type { StudioPlaygroundJob } from '@pages/studio/playground/types';
import type { IngredientsService } from '@services/content/ingredients.service';
import { MediaPreviewBatchService } from '@services/content/media-preview-batch.service';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function grant(
  state: MediaDeliveryGrant['state'],
  url: string | null = null,
): MediaDeliveryGrant {
  return { expiresAt: null, id: 'ing-1', purpose: 'preview', state, url };
}

const pendingJob: StudioPlaygroundJob = {
  createdAt: 1,
  id: 'job-1',
  ingredient: new Image({
    id: 'ing-1',
    mediaDelivery: grant('PENDING'),
    status: IngredientStatus.GENERATED,
  }),
  ingredientId: 'ing-1',
  prompt: 'Saved image',
  status: IngredientStatus.GENERATED,
  type: 'image',
};

function renderPreviews(
  previewGrant: ReturnType<typeof vi.fn>,
  jobs: readonly StudioPlaygroundJob[] = [pendingJob],
) {
  const recoverPreview = vi.fn();
  const service = { previewGrant } as unknown as IngredientsService;
  const getIngredientsService = vi.fn().mockResolvedValue(service);
  const view = renderHook(
    ({ jobs }) =>
      useStudioPendingPreviews({ getIngredientsService, jobs, recoverPreview }),
    { initialProps: { jobs } },
  );
  return { ...view, getIngredientsService, recoverPreview };
}

afterEach(() => vi.useRealTimers());

describe('isStudioPreviewPending', () => {
  it('flags a saved asset whose preview is still being prepared', () => {
    expect(isStudioPreviewPending(pendingJob)).toBe(true);
  });

  it('tracks a restored failed preview without treating the saved generation as failed', () => {
    expect(
      isStudioPreviewPending({
        ...pendingJob,
        ingredient: new Image({ id: 'ing-1', mediaDelivery: grant('FAILED') }),
      }),
    ).toBe(true);
  });

  it('ignores deleted assets and terminal unsupported previews', () => {
    expect(
      isStudioPreviewPending({
        ...pendingJob,
        ingredient: new Image({
          id: 'ing-1',
          isDeleted: true,
          mediaDelivery: grant('PENDING'),
        }),
      }),
    ).toBe(false);
    expect(
      isStudioPreviewPending({
        ...pendingJob,
        ingredient: new Image({
          id: 'ing-1',
          mediaDelivery: grant('UNSUPPORTED'),
        }),
      }),
    ).toBe(false);
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

  it.each(['image-edit', 'video'] as const)(
    'observes backend recovery after reload for a %s without retrying a failed render',
    async (type) => {
      vi.useFakeTimers();
      const job: StudioPlaygroundJob = {
        ...pendingJob,
        type,
        ingredient: new Image({ id: 'ing-1', mediaDelivery: grant('FAILED') }),
      };
      const read = vi
        .fn()
        .mockResolvedValueOnce([
          new Image({ id: 'ing-1', mediaDelivery: grant('FAILED') }),
        ])
        .mockResolvedValueOnce([
          new Image({ id: 'ing-1', mediaDelivery: grant('PENDING') }),
        ])
        .mockResolvedValue([
          new Image({
            id: 'ing-1',
            mediaDelivery: grant('READY', 'https://cdn/ready'),
          }),
        ]);
      const prepare = vi.fn().mockResolvedValue(undefined);
      const batch = new MediaPreviewBatchService(read, prepare);
      const previewGrant = vi.fn(batch.request.bind(batch));
      const { recoverPreview } = renderPreviews(previewGrant, [job]);

      await vi.advanceTimersByTimeAsync(25);
      expect(read).toHaveBeenCalledTimes(1);
      expect(prepare).not.toHaveBeenCalled();
      expect(recoverPreview).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(read).toHaveBeenCalledTimes(3);
      expect(prepare).toHaveBeenCalledExactlyOnceWith(['ing-1']);
      expect(recoverPreview).toHaveBeenCalledExactlyOnceWith(
        job,
        'https://cdn/ready',
      );
      expect(previewGrant.mock.calls.every((call) => call.length === 2)).toBe(
        true,
      );
    },
  );

  it('keeps observing a pending preview through a transient failed worker attempt', async () => {
    vi.useFakeTimers();
    const previewGrant = vi
      .fn()
      .mockResolvedValueOnce(grant('FAILED'))
      .mockResolvedValueOnce(grant('PENDING'))
      .mockResolvedValue(grant('READY', 'https://cdn/ready'));
    const { recoverPreview } = renderPreviews(previewGrant);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(previewGrant).toHaveBeenCalledTimes(3);
    expect(recoverPreview).toHaveBeenCalledExactlyOnceWith(
      pendingJob,
      'https://cdn/ready',
    );
  });

  it('bounds passive reads without preparing a permanently failed render', async () => {
    vi.useFakeTimers();
    const read = vi
      .fn()
      .mockResolvedValue([
        new Image({ id: 'ing-1', mediaDelivery: grant('FAILED') }),
      ]);
    const prepare = vi.fn();
    const batch = new MediaPreviewBatchService(read, prepare);
    const previewGrant = vi.fn(batch.request.bind(batch));
    const { recoverPreview } = renderPreviews(previewGrant);

    await vi.advanceTimersByTimeAsync(1_300_000);

    expect(read).toHaveBeenCalledTimes(40);
    expect(prepare).not.toHaveBeenCalled();
    expect(recoverPreview).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(40);
  });

  it('stops asking once the API reports an unsupported preview', async () => {
    vi.useFakeTimers();
    const previewGrant = vi.fn().mockResolvedValue(grant('UNSUPPORTED'));
    const { recoverPreview } = renderPreviews(previewGrant);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(previewGrant).toHaveBeenCalledTimes(1);
    expect(recoverPreview).not.toHaveBeenCalled();
  });

  it.each([
    { ...grant('READY', 'https://cdn/foreign'), id: 'another-ingredient' },
    {
      ...grant('READY', 'https://cdn/public'),
      purpose: 'public-share' as const,
    },
  ])(
    'does not adopt a grant for another asset or purpose (%j)',
    async (response) => {
      vi.useFakeTimers();
      const previewGrant = vi.fn().mockResolvedValue(response);
      const { recoverPreview } = renderPreviews(previewGrant);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(recoverPreview).not.toHaveBeenCalled();
    },
  );

  it('aborts and ignores a late grant when the saved generation is cancelled or deleted', async () => {
    vi.useFakeTimers();
    let resolve: (value: MediaDeliveryGrant) => void = () => {};
    const previewGrant = vi.fn<IngredientsService['previewGrant']>(
      () =>
        new Promise<MediaDeliveryGrant>((accept) => {
          resolve = accept;
        }),
    );
    const { recoverPreview, rerender } = renderPreviews(previewGrant);
    await vi.advanceTimersByTimeAsync(0);
    const signal: AbortSignal = previewGrant.mock.calls[0][1];

    rerender({
      jobs: [
        { ...pendingJob, status: IngredientStatus.FAILED, phase: 'cancelled' },
      ],
    });
    expect(signal.aborted).toBe(true);
    resolve(grant('READY', 'https://cdn/late'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(recoverPreview).not.toHaveBeenCalled();
    expect(previewGrant).toHaveBeenCalledTimes(1);

    rerender({
      jobs: [
        {
          ...pendingJob,
          ingredient: new Image({
            id: 'ing-1',
            isDeleted: true,
            mediaDelivery: grant('FAILED'),
          }),
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(previewGrant).toHaveBeenCalledTimes(1);
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
