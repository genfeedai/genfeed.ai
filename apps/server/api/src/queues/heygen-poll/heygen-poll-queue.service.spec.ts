import {
  FakeBullQueue,
  type FakeJobState,
} from '@api/queues/fake-bullmq-queue';
import { HeygenPollQueueService } from '@api/queues/heygen-poll/heygen-poll-queue.service';
import type { LoggerService } from '@libs/logger/logger.service';

const logger = { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService;

function setup() {
  const queue = new FakeBullQueue();
  const service = new HeygenPollQueueService(queue.asQueue(), logger);
  return { queue, service };
}

const data = {
  continuationId: 'cont-1',
  externalId: 'vid-1',
  ingredientId: 'ing-1',
  organizationId: 'org-1',
};
const jobId = 'heygen-poll-cont-1-1';

describe('HeygenPollQueueService recovery', () => {
  it('hasAttempt is false for a missing id and a retained finished job', async () => {
    const { queue, service } = setup();
    expect(await service.hasAttempt('cont-1', 1)).toBe(false);
    queue.seed(jobId, 'completed');
    expect(await service.hasAttempt('cont-1', 1)).toBe(false);
    queue.seed(jobId, 'failed');
    expect(await service.hasAttempt('cont-1', 1)).toBe(false);
  });

  for (const state of ['waiting', 'delayed', 'active'] as FakeJobState[]) {
    it(`hasAttempt is true for a live ${state} job`, async () => {
      const { queue, service } = setup();
      queue.seed(jobId, state);
      expect(await service.hasAttempt('cont-1', 1)).toBe(true);
    });
  }

  it('enqueues a poll when none exists', async () => {
    const { queue, service } = setup();

    await service.schedule(data);

    expect(queue.liveJobIds()).toEqual([jobId]);
  });

  for (const state of ['waiting', 'delayed', 'active'] as FakeJobState[]) {
    it(`leaves a live ${state} job alone`, async () => {
      const { queue, service } = setup();
      queue.seed(jobId, state);

      const id = await service.schedule(data);

      expect(id).toBe(jobId);
      expect(queue.stateOf(jobId)).toBe(state);
    });
  }

  for (const state of ['completed', 'failed'] as FakeJobState[]) {
    it(`re-enqueues when a ${state} job is still retained under the id`, async () => {
      const { queue, service } = setup();
      queue.seed(jobId, state);

      await service.schedule(data);

      expect(queue.liveJobIds()).toEqual([jobId]);
    });
  }
});
