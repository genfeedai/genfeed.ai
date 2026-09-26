import type { MediaVisionEvaluationService } from '@api/services/media-assessment/media-vision-evaluation.service';
import type { MediaModerationService } from '@api/services/moderation/media-moderation.service';
import type { MediaModerationJobData } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import { MediaModerationProcessor } from '@workers/processors/api/queues/media-moderation/media-moderation.processor';
import type { Job } from 'bullmq';

describe('MediaModerationProcessor', () => {
  it('delegates the job to the moderation service', async () => {
    const moderate = vi.fn().mockResolvedValue('classified');
    const logger = { log: vi.fn() };
    const evaluate = vi.fn().mockResolvedValue('evaluated');
    const processor = new MediaModerationProcessor(
      { moderate } as unknown as MediaModerationService,
      { evaluate } as unknown as MediaVisionEvaluationService,
      logger as unknown as LoggerService,
    );
    const data: MediaModerationJobData = {
      ingredientId: 'asset-1',
      organizationId: 'org-1',
    };

    await processor.process({ data } as Job<MediaModerationJobData>);

    expect(moderate).toHaveBeenCalledWith(data);
    expect(evaluate).toHaveBeenCalledWith(data);
    expect(logger.log).toHaveBeenCalledWith(
      'MediaModerationProcessor finished',
      expect.objectContaining({
        outcome: 'classified',
        visionOutcome: 'evaluated',
      }),
    );
  });
});
