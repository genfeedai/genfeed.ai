import type { MediaVisionEvaluationService } from '@api/services/media-assessment/media-vision-evaluation.service';
import type { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import type { MediaPerceptionQueueService } from '@api/services/media-perception/media-perception-queue.service';
import type { MediaTextDecisionService } from '@api/services/media-text-decisions/media-text-decision.service';
import type { MediaModerationService } from '@api/services/moderation/media-moderation.service';
import type { MediaModerationQueueService } from '@api/services/moderation/media-moderation-queue.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { CronMediaPerceptionService } from '@workers/crons/media-perception/cron.media-perception.service';
import { MEDIA_PERCEPTION_SWEEP_BATCH_SIZE } from '@workers/crons/media-perception/media-perception.constants';

function makeHarness(isEnabled = true) {
  const perception = {
    findDueRetries: vi
      .fn()
      .mockResolvedValue([
        { ingredientId: 'asset-2', organizationId: 'org-1' },
      ]),
    findUnperceivedAssets: vi
      .fn()
      .mockResolvedValue([
        { ingredientId: 'asset-1', organizationId: 'org-1' },
      ]),
    getSettings: vi.fn().mockResolvedValue({ isEnabled, lookbackHours: 24 }),
  };
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const moderation = {
    findUnmoderatedAssets: vi
      .fn()
      .mockResolvedValue([
        { ingredientId: 'asset-3', organizationId: 'org-1' },
      ]),
  };
  const moderationQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const text = {
    findUndecidedAssets: vi
      .fn()
      .mockResolvedValue([
        { ingredientId: 'asset-5', organizationId: 'org-1' },
      ]),
  };
  const vision = {
    findUnevaluatedAssets: vi
      .fn()
      .mockResolvedValue([
        { ingredientId: 'asset-4', organizationId: 'org-1' },
      ]),
  };
  const logger = { error: vi.fn(), log: vi.fn() };
  const service = new CronMediaPerceptionService(
    perception as unknown as MediaPerceptionService,
    queue as unknown as MediaPerceptionQueueService,
    moderation as unknown as MediaModerationService,
    moderationQueue as unknown as MediaModerationQueueService,
    vision as unknown as MediaVisionEvaluationService,
    text as unknown as MediaTextDecisionService,
    logger as unknown as LoggerService,
  );
  return { logger, moderation, moderationQueue, perception, queue, service };
}

describe('CronMediaPerceptionService', () => {
  it('queues unperceived assets and due retries', async () => {
    const { perception, queue, service } = makeHarness();
    const now = new Date('2026-09-26T12:00:00.000Z');

    await expect(service.queueDuePerceptions(now)).resolves.toEqual({
      queuedModerations: 3,
      queuedPerceptions: 1,
      queuedRetries: 1,
    });
    expect(perception.findUnperceivedAssets).toHaveBeenCalledWith(
      new Date('2026-09-25T12:00:00.000Z'),
      MEDIA_PERCEPTION_SWEEP_BATCH_SIZE,
    );
    expect(perception.findDueRetries).toHaveBeenCalledWith(
      now,
      MEDIA_PERCEPTION_SWEEP_BATCH_SIZE,
    );
    expect(queue.enqueue).toHaveBeenCalledWith(
      { ingredientId: 'asset-1', organizationId: 'org-1' },
      'perceive',
    );
    expect(queue.enqueue).toHaveBeenCalledWith(
      { ingredientId: 'asset-2', organizationId: 'org-1' },
      'retry',
    );
  });

  it('queues settled perceptions for moderation and vision evaluation', async () => {
    const { moderationQueue, service } = makeHarness();

    await service.queueDuePerceptions();

    expect(moderationQueue.enqueue).toHaveBeenCalledWith({
      ingredientId: 'asset-3',
      organizationId: 'org-1',
    });
    expect(moderationQueue.enqueue).toHaveBeenCalledWith({
      ingredientId: 'asset-4',
      organizationId: 'org-1',
    });
  });

  it('does nothing when perception is disabled', async () => {
    const { perception, queue, service } = makeHarness(false);

    await expect(service.queueDuePerceptions()).resolves.toEqual({
      queuedModerations: 0,
      queuedPerceptions: 0,
      queuedRetries: 0,
    });
    expect(perception.findUnperceivedAssets).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('reads the perception switch on every tick, not just at startup (#5407)', async () => {
    const { perception, queue, service } = makeHarness();
    perception.getSettings
      .mockResolvedValueOnce({ isEnabled: false, lookbackHours: 24 })
      .mockResolvedValueOnce({ isEnabled: true, lookbackHours: 24 });

    await expect(service.queueDuePerceptions()).resolves.toEqual({
      queuedModerations: 0,
      queuedPerceptions: 0,
      queuedRetries: 0,
    });
    expect(perception.findUnperceivedAssets).not.toHaveBeenCalled();

    await expect(service.queueDuePerceptions()).resolves.toEqual({
      queuedModerations: 3,
      queuedPerceptions: 1,
      queuedRetries: 1,
    });
    expect(perception.findUnperceivedAssets).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith(
      { ingredientId: 'asset-1', organizationId: 'org-1' },
      'perceive',
    );
    expect(perception.getSettings).toHaveBeenCalledTimes(2);
  });

  it('keeps sweeping when one enqueue fails', async () => {
    const { logger, queue, service } = makeHarness();
    queue.enqueue.mockRejectedValueOnce(new Error('redis down'));

    await expect(service.queueDuePerceptions()).resolves.toEqual({
      queuedModerations: 3,
      queuedPerceptions: 0,
      queuedRetries: 1,
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('continues scheduling other discovery candidates when one discovery query rejects (#5316)', async () => {
    const { logger, moderationQueue, perception } = makeHarness();
    perception.findUnperceivedAssets.mockResolvedValueOnce([]);
    perception.findDueRetries.mockResolvedValueOnce([]);
    const vision = {
      findUnevaluatedAssets: vi
        .fn()
        .mockRejectedValue(new Error('vision discovery outage')),
    };
    const brokenService = new CronMediaPerceptionService(
      perception as unknown as MediaPerceptionService,
      {
        enqueue: vi.fn().mockResolvedValue(undefined),
      } as unknown as MediaPerceptionQueueService,
      {
        findUnmoderatedAssets: vi
          .fn()
          .mockResolvedValue([
            { ingredientId: 'asset-3', organizationId: 'org-1' },
          ]),
      } as unknown as MediaModerationService,
      moderationQueue as unknown as MediaModerationQueueService,
      vision as unknown as MediaVisionEvaluationService,
      {
        findUndecidedAssets: vi
          .fn()
          .mockResolvedValue([
            { ingredientId: 'asset-5', organizationId: 'org-1' },
          ]),
      } as unknown as MediaTextDecisionService,
      logger as unknown as LoggerService,
    );

    await expect(brokenService.queueDuePerceptions()).resolves.toMatchObject({
      queuedModerations: 2,
    });
    expect(moderationQueue.enqueue).toHaveBeenCalledWith({
      ingredientId: 'asset-3',
      organizationId: 'org-1',
    });
    expect(moderationQueue.enqueue).toHaveBeenCalledWith({
      ingredientId: 'asset-5',
      organizationId: 'org-1',
    });
    expect(logger.error).toHaveBeenCalledWith(
      'CronMediaPerceptionService discovery query failed',
      expect.objectContaining({ source: 'vision' }),
    );
  });
});
