import type { MediaVisionEvaluationService } from '@api/services/media-assessment/media-vision-evaluation.service';
import type { MediaTextDecisionService } from '@api/services/media-text-decisions/media-text-decision.service';
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
    const decide = vi.fn().mockResolvedValue('decided');
    const processor = new MediaModerationProcessor(
      { moderate } as unknown as MediaModerationService,
      { evaluate } as unknown as MediaVisionEvaluationService,
      { evaluate: decide } as unknown as MediaTextDecisionService,
      logger as unknown as LoggerService,
    );
    const data: MediaModerationJobData = {
      ingredientId: 'asset-1',
      organizationId: 'org-1',
    };

    await processor.process({ data } as Job<MediaModerationJobData>);

    expect(moderate).toHaveBeenCalledWith(data);
    expect(evaluate).toHaveBeenCalledWith(data);
    expect(decide).toHaveBeenCalledWith(data);
    expect(logger.log).toHaveBeenCalledWith(
      'MediaModerationProcessor finished',
      expect.objectContaining({
        outcome: 'classified',
        textOutcome: 'decided',
        visionOutcome: 'evaluated',
      }),
    );
  });

  it('still runs vision when moderation throws, then fails the job', async () => {
    const moderate = vi.fn().mockRejectedValue(new Error('vendor down'));
    const evaluate = vi.fn().mockResolvedValue('evaluated');
    const processor = new MediaModerationProcessor(
      { moderate } as unknown as MediaModerationService,
      { evaluate } as unknown as MediaVisionEvaluationService,
      { log: vi.fn() } as unknown as LoggerService,
    );

    await expect(
      processor.process({
        data: { ingredientId: 'asset-1', organizationId: 'org-1' },
      } as Job<MediaModerationJobData>),
    ).rejects.toThrow('vendor down');
    expect(evaluate).toHaveBeenCalledOnce();
  });
});
