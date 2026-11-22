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

  describe('when a concurrent enqueue reclaims the id before the removal', () => {
    function racingQueue(afterRemoveFails: 'active' | undefined) {
      let reads = 0;
      return {
        getJob: async () => {
          reads += 1;
          if (reads === 1) {
            return {
              getState: async (): Promise<'completed'> => 'completed',
              remove: async () => {
                throw new Error('Could not remove job: locked');
              },
            };
          }
          return afterRemoveFails
            ? {
                getState: async () => afterRemoveFails,
                remove: async () => undefined,
              }
            : undefined;
        },
      };
    }

    it('reports the reclaimed job as already queued', async () => {
      const result = await reserveIdempotentJob(racingQueue('active'), 'job-1');

      expect(result).toEqual({ alreadyQueued: true, state: 'active' });
    });

    it('still throws when the removal failed for another reason', async () => {
      await expect(
        reserveIdempotentJob(racingQueue(undefined), 'job-1'),
      ).rejects.toThrow('locked');
    });
  });
});
