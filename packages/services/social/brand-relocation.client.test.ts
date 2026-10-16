import { BrandRelocationStatus } from '@genfeedai/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pollBrandRelocation } from './brand-relocation.client';

const processing = {
  operation: {
    id: 'move-1',
    brandId: 'brand-1',
    organizationId: 'source',
    destinationOrganizationId: 'destination',
    status: BrandRelocationStatus.PROCESSING,
  },
};
const done = {
  operation: { ...processing.operation, status: BrandRelocationStatus.DONE },
};

afterEach(() => vi.useRealTimers());

describe('brand move polling', () => {
  it('recovers a lost acceptance response by submitting the same idempotent request', async () => {
    vi.useFakeTimers();
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error('request timed out'))
      .mockResolvedValue(processing);
    const read = vi.fn().mockResolvedValue(done);
    const promise = pollBrandRelocation(submit, read);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toEqual(done);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('keeps processing across timeout, network and server errors until done', async () => {
    vi.useFakeTimers();
    const read = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(done);
    const onProcessing = vi.fn();
    const promise = pollBrandRelocation(async () => processing, read, {
      onProcessing,
    });
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).resolves.toEqual(done);
    expect(onProcessing).toHaveBeenCalledWith(true);
  });

  it('only rejects an accepted move after the server confirms rollback', async () => {
    const response = {
      operation: {
        ...processing.operation,
        status: BrandRelocationStatus.FAILED,
        error: 'History prevents this move',
      },
    };
    await expect(
      pollBrandRelocation(async () => response, vi.fn()),
    ).rejects.toThrow('History prevents this move');
  });

  it('stops polling on unmount without cancelling the background operation', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const read = vi.fn();
    const promise = pollBrandRelocation(async () => processing, read, {
      signal: controller.signal,
    });
    const assertion = expect(promise).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await assertion;
    expect(read).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
