import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { MediaPreviewBatchService } from '@services/content/media-preview-batch.service';
import { afterEach, describe, expect, it, vi } from 'vitest';

const id = testId('ingredient', 1);
const ready = {
  id,
  mediaDelivery: {
    id,
    purpose: 'preview',
    state: 'READY',
    url: 'https://cdn.example/preview.png',
    expiresAt: null,
  },
} as IIngredient;

afterEach(() => vi.useRealTimers());

describe('preview refresh coalescing', () => {
  it('coalesces grid requests and preserves explicit asynchronous preparation', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue([ready]);
    const prepare = vi.fn();
    const batch = new MediaPreviewBatchService(read, prepare);
    const controller = new AbortController();
    const a = batch.request(id, controller.signal);
    const b = batch.request(id, controller.signal);
    await vi.advanceTimersByTimeAsync(25);
    expect(await a).toEqual(ready.mediaDelivery);
    expect(await b).toEqual(ready.mediaDelivery);
    expect(read).toHaveBeenCalledOnce();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('does not retain a failed request and retries the same media identity on the next batch', async () => {
    vi.useFakeTimers();
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue([ready]);
    const batch = new MediaPreviewBatchService(read, vi.fn());
    const controller = new AbortController();
    const first = batch.request(id, controller.signal);
    await vi.advanceTimersByTimeAsync(25);
    expect(await first).toBeNull();
    const second = batch.request(id, controller.signal);
    await vi.advanceTimersByTimeAsync(25);
    expect(await second).toEqual(ready.mediaDelivery);
  });

  it('an aborted workspace request receives no later grant', async () => {
    vi.useFakeTimers();
    const batch = new MediaPreviewBatchService(
      vi.fn().mockResolvedValue([ready]),
      vi.fn(),
    );
    const controller = new AbortController();
    const pending = batch.request(id, controller.signal);
    controller.abort();
    await vi.advanceTimersByTimeAsync(25);
    expect(await pending).toBeNull();
  });
});
