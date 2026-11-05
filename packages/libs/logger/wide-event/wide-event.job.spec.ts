import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enrichWideEvent } from './wide-event.context';
import type { WideEventRecord } from './wide-event.interface';
import { runJobWithWideEvent } from './wide-event.job';

const identity = { service: 'workers' };

function createJob(overrides: Record<string, unknown> = {}) {
  return {
    attemptsMade: 0,
    data: {
      amount: 25,
      organizationId: 'org-1',
      prompt: 'never logged',
      userId: 'user-1',
    },
    id: 'job-1',
    name: 'deduct-credits',
    opts: { attempts: 3 },
    queueName: 'credit-deduction',
    ...overrides,
  };
}

describe('runJobWithWideEvent', () => {
  beforeEach(() => {
    // Pin the baseline sample so ordinary successes are kept.
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits one event with queue, attempt and tenant ids, and not the payload', async () => {
    const events: WideEventRecord[] = [];

    const result = await runJobWithWideEvent(
      createJob({ attemptsMade: 1 }),
      { identity, sink: { wideEvent: (event) => events.push(event) } },
      async () => {
        enrichWideEvent({ credits: { amount: 25 } });
        return 'done';
      },
    );

    expect(result).toBe('done');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      credits: { amount: 25 },
      job: {
        attempt: 2,
        id: 'job-1',
        max_attempts: 3,
        name: 'deduct-credits',
        queue: 'credit-deduction',
      },
      kind: 'job',
      organization: { id: 'org-1' },
      outcome: 'success',
      request_id: 'job:credit-deduction:job-1',
      service: 'workers',
      user: { id: 'user-1' },
    });
    expect(JSON.stringify(events[0])).not.toContain('never logged');
  });

  it('records a failure and rethrows it so BullMQ still retries', async () => {
    const events: WideEventRecord[] = [];
    const failure = new Error('provider timed out');

    await expect(
      runJobWithWideEvent(
        createJob(),
        { identity, sink: { wideEvent: (event) => events.push(event) } },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      error: { message: 'provider timed out', type: 'Error' },
      outcome: 'error',
    });
  });

  it('omits tenant buckets when the payload carries no ids', async () => {
    const events: WideEventRecord[] = [];

    await runJobWithWideEvent(
      createJob({ data: undefined }),
      { identity, sink: { wideEvent: (event) => events.push(event) } },
      async () => undefined,
    );

    expect(events[0]).not.toHaveProperty('organization');
    expect(events[0]).not.toHaveProperty('user');
  });
});
