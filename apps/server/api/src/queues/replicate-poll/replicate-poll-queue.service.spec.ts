import {
  FakeBullQueue,
  type FakeJobState,
} from '@api/queues/fake-bullmq-queue';
import { ReplicatePollQueueService } from '@api/queues/replicate-poll/replicate-poll-queue.service';
import { IngredientCategory } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

const logger = { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService;

function setup() {
  const queue = new FakeBullQueue();
  const service = new ReplicatePollQueueService(queue.asQueue(), logger);
  return { queue, service };
}

const data = {
  category: IngredientCategory.IMAGE,
  externalId: 'pred-1',
  ingredientId: 'ing-1',
  organizationId: 'org-1',
};
const jobId = 'replicate-poll-ing-1-1';

describe('ReplicatePollQueueService recovery', () => {
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
