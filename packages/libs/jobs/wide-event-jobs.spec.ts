import type { WideEventRecord } from '@libs/logger/wide-event/wide-event.interface';
import { ProcessorDecoratorService } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installWideEventJobInstrumentation } from './wide-event-jobs';

describe('installWideEventJobInstrumentation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes every BullMQ processor emit one wide event', async () => {
    // Pin the baseline sample so an ordinary success is kept.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const events: WideEventRecord[] = [];
    installWideEventJobInstrumentation({
      identity: { service: 'workers' },
      sink: { wideEvent: (event) => events.push(event) },
    });

    const processor = new ProcessorDecoratorService().decorate(
      async (job: Job) => `processed ${job.id}`,
    );
    const result = await processor(
      {
        attemptsMade: 0,
        data: { organizationId: 'org-1' },
        id: 'job-1',
        name: 'poll',
        queueName: 'replicate-poll',
      } as unknown as Job,
      'token',
    );

    expect(result).toBe('processed job-1');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      job: { name: 'poll', queue: 'replicate-poll' },
      organization: { id: 'org-1' },
      service: 'workers',
    });
  });
});
