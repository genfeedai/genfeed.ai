import type { Queue } from 'bullmq';

export type FakeJobState =
  | 'waiting'
  | 'delayed'
  | 'active'
  | 'completed'
  | 'failed';

interface FakeJobRecord {
  data: unknown;
  state: FakeJobState;
}

/**
 * In-memory queue that follows BullMQ's id semantics: `getJob` resolves
 * `undefined` for a missing id, and `add` with an id that already exists
 * (in any state) returns the existing job and enqueues nothing.
 */
export class FakeBullQueue {
  private readonly jobs = new Map<string, FakeJobRecord>();

  seed(jobId: string, state: FakeJobState): void {
    this.jobs.set(jobId, { data: undefined, state });
  }

  stateOf(jobId: string): FakeJobState | undefined {
    return this.jobs.get(jobId)?.state;
  }

  liveJobIds(): string[] {
    return [...this.jobs.entries()]
      .filter(([, job]) => job.state !== 'completed' && job.state !== 'failed')
      .map(([id]) => id);
  }

  async getJob(jobId: string) {
    const record = this.jobs.get(jobId);
    if (!record) return undefined;
    return {
      getState: async () => record.state,
      id: jobId,
      remove: async () => {
        this.jobs.delete(jobId);
      },
    };
  }

  async add(
    _name: string,
    data: unknown,
    options: { delay?: number; jobId: string },
  ) {
    if (!this.jobs.has(options.jobId)) {
      this.jobs.set(options.jobId, {
        data,
        state: options.delay ? 'delayed' : 'waiting',
      });
    }
    return { id: options.jobId };
  }

  asQueue<T>(): Queue<T> {
    return this as unknown as Queue<T>;
  }
}
