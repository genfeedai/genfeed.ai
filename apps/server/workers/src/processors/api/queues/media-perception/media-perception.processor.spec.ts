import type { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import type { MediaModerationQueueService } from '@api/services/moderation/media-moderation-queue.service';
import type { MediaPerceptionJobData } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import { MediaPerceptionProcessor } from '@workers/processors/api/queues/media-perception/media-perception.processor';
import type { Job } from 'bullmq';

describe('MediaPerceptionProcessor', () => {
  it('delegates the job to the perception service', async () => {
    const process = vi.fn().mockResolvedValue('perceived');
    const logger = { log: vi.fn() };
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const processor = new MediaPerceptionProcessor(
      { process } as unknown as MediaPerceptionService,
      { enqueue } as unknown as MediaModerationQueueService,
      logger as unknown as LoggerService,
    );
    const data: MediaPerceptionJobData = {
      ingredientId: 'asset-1',
      organizationId: 'org-1',
      reason: 'perceive',
    };

    await processor.process({ data } as Job<MediaPerceptionJobData>);

    expect(process).toHaveBeenCalledWith(data);
    expect(enqueue).toHaveBeenCalledWith(data);
    expect(logger.log).toHaveBeenCalledWith(
      'MediaPerceptionProcessor finished',
      expect.objectContaining({ outcome: 'perceived' }),
    );
  });
});
