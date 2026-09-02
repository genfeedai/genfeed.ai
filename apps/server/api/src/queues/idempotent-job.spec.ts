import type { Job } from 'bullmq';
import { reserveIdempotentJob } from './idempotent-job';

function fakeQueue(job: Pick<Job, 'getState' | 'remove'> | undefined) {
  const removed: string[] = [];
  const queue = {
    getJob: async (id: string) => {
      if (!job) return undefined;
      return {
        getState: job.getState,
        remove: async () => {
          removed.push(id);
          await job.remove();
        },
      };
    },
  };
  return { queue, removed };
}

describe('reserveIdempotentJob', () => {
  it('allows enqueue when no job exists for the id', async () => {
    const { queue } = fakeQueue(undefined);

    const result = await reserveIdempotentJob(queue, 'job-1');

    expect(result).toEqual({ alreadyQueued: false });
  });

  for (const state of ['active', 'waiting', 'delayed'] as const) {
    it(`refuses enqueue and preserves an in-flight job (${state})`, async () => {
      const { queue, removed } = fakeQueue({
        getState: async () => state,
        remove: async () => undefined,
      });

      const result = await reserveIdempotentJob(queue, 'job-1');

      expect(result).toEqual({ alreadyQueued: true, state });
      expect(removed).toEqual([]);
    });
  }

  for (const state of ['completed', 'failed', 'unknown'] as const) {
    it(`removes a stale job and allows enqueue (${state})`, async () => {
      const { queue, removed } = fakeQueue({
        getState: async () => state,
        remove: async () => undefined,
      });

      const result = await reserveIdempotentJob(queue, 'job-1');

      expect(result).toEqual({ alreadyQueued: false });
      expect(removed).toEqual(['job-1']);
    });
  }
});
