import {
  BrandVisionQueueService,
  brandVisionJobId,
} from '@api/services/brand-validation/brand-vision-queue.service';
import type { BrandVisionJobData } from '@genfeedai/contracts/queue';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

const data: BrandVisionJobData = {
  actorId: 'user-a',
  brandId: 'brand-a',
  organizationId: 'org-a',
  receiptId: 'receipt-a',
};

describe('BrandVisionQueueService', () => {
  it('queues one run-once job per receipt carrying only ids', async () => {
    const queue = { add: vi.fn(async () => undefined) };
    const service = new BrandVisionQueueService(
      queue as unknown as Queue<BrandVisionJobData>,
    );
    await service.enqueue(data);
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'analyze',
      data,
      expect.objectContaining({
        attempts: 1,
        jobId: 'brand-vision-receipt-a',
      }),
    );
  });

  it('derives the job id from the receipt so a replayed validation joins the same job', () => {
    expect(brandVisionJobId('receipt-a')).toBe(brandVisionJobId('receipt-a'));
    expect(brandVisionJobId('receipt-a')).not.toBe(
      brandVisionJobId('receipt-b'),
    );
  });
});
