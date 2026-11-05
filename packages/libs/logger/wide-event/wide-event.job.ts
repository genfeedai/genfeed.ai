import { randomUUID } from 'node:crypto';
import { recordWideEventError, runWithWideEvent } from './wide-event.context';
import type { WideEventServiceIdentity } from './wide-event.interface';
import {
  finishWideEvent,
  startWideEvent,
  type WideEventSink,
} from './wide-event.lifecycle';
import { resolveTraceContext } from './wide-event.trace';

/** The slice of a BullMQ job a wide event needs. Job payloads are never logged. */
export interface WideEventJobLike {
  id?: string;
  name: string;
  queueName: string;
  attemptsMade: number;
  data?: unknown;
  opts?: { attempts?: number };
}

interface WideEventJobOptions {
  identity: WideEventServiceIdentity;
  sink: WideEventSink;
}

function readId(data: unknown, key: string): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Runs one queue job as one wide event: queue, attempt, tenant ids from the
 * payload, duration and outcome. A thrown error is recorded and rethrown, so
 * BullMQ retry behaviour is unchanged.
 */
export async function runJobWithWideEvent<T>(
  job: WideEventJobLike,
  options: WideEventJobOptions,
  work: () => Promise<T>,
): Promise<T> {
  const started = startWideEvent({
    fields: {
      brand: { id: readId(job.data, 'brandId') },
      job: {
        attempt: job.attemptsMade + 1,
        id: job.id,
        max_attempts: job.opts?.attempts,
        name: job.name,
        queue: job.queueName,
      },
      organization: { id: readId(job.data, 'organizationId') },
      user: { id: readId(job.data, 'userId') },
    },
    identity: options.identity,
    kind: 'job',
    requestId: job.id ? `job:${job.queueName}:${job.id}` : randomUUID(),
    trace: resolveTraceContext(undefined),
  });

  return runWithWideEvent(started.event, async () => {
    try {
      const result = await work();
      finishWideEvent(options.sink, started);
      return result;
    } catch (error: unknown) {
      recordWideEventError(error);
      finishWideEvent(options.sink, started);
      throw error;
    }
  });
}
