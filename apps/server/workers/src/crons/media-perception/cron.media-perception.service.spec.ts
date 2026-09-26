import type { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import type { MediaPerceptionQueueService } from '@api/services/media-perception/media-perception-queue.service';
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
    settings: { isEnabled, lookbackHours: 24 },
  };
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const logger = { error: vi.fn(), log: vi.fn() };
  const service = new CronMediaPerceptionService(
    perception as unknown as MediaPerceptionService,
    queue as unknown as MediaPerceptionQueueService,
    logger as unknown as LoggerService,
  );
  return { logger, perception, queue, service };
}

describe('CronMediaPerceptionService', () => {
  it('queues unperceived assets and due retries', async () => {
    const { perception, queue, service } = makeHarness();
    const now = new Date('2026-09-26T12:00:00.000Z');

    await expect(service.queueDuePerceptions(now)).resolves.toEqual({
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

  it('does nothing when perception is disabled', async () => {
    const { perception, queue, service } = makeHarness(false);

    await expect(service.queueDuePerceptions()).resolves.toEqual({
      queuedPerceptions: 0,
      queuedRetries: 0,
    });
    expect(perception.findUnperceivedAssets).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('keeps sweeping when one enqueue fails', async () => {
    const { logger, queue, service } = makeHarness();
    queue.enqueue.mockRejectedValueOnce(new Error('redis down'));

    await expect(service.queueDuePerceptions()).resolves.toEqual({
      queuedPerceptions: 0,
      queuedRetries: 1,
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
