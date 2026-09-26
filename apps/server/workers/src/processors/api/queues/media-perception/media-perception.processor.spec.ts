import type { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import type { MediaPerceptionJobData } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import { MediaPerceptionProcessor } from '@workers/processors/api/queues/media-perception/media-perception.processor';
import type { Job } from 'bullmq';

describe('MediaPerceptionProcessor', () => {
  it('delegates the job to the perception service', async () => {
    const process = vi.fn().mockResolvedValue('perceived');
    const logger = { log: vi.fn() };
    const processor = new MediaPerceptionProcessor(
      { process } as unknown as MediaPerceptionService,
      logger as unknown as LoggerService,
    );
    const data: MediaPerceptionJobData = {
      ingredientId: 'asset-1',
      organizationId: 'org-1',
      reason: 'perceive',
    };

    await processor.process({ data } as Job<MediaPerceptionJobData>);

    expect(process).toHaveBeenCalledWith(data);
    expect(logger.log).toHaveBeenCalledWith(
      'MediaPerceptionProcessor finished',
      expect.objectContaining({ outcome: 'perceived' }),
    );
  });
});
