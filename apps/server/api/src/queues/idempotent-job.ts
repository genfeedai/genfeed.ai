import type { Job } from 'bullmq';

/**
 * Job states that represent an in-flight job which must NOT be superseded by a
 * duplicate enqueue under the same deterministic id. A job in any other state
 * (completed/failed/etc.) is stale and gets removed so a fresh job can reclaim
 * the id.
 */
const ACTIVE_JOB_STATES = new Set<string>(['active', 'waiting', 'delayed']);

export type IdempotentJobReservation =
  | { alreadyQueued: true; state: string }
  | { alreadyQueued: false };

/**
 * Reserve a deterministic BullMQ job id.
 *
 * Looks up an existing job by id: if it is still in flight
 * (active/waiting/delayed) the reservation is refused so the caller can skip the
 * enqueue; if it exists in any terminal/stale state it is removed so the caller
 * can re-add under the same id. Returns whether the caller should proceed to
 * enqueue.
 *
 * Extracted from the byte-identical precheck that was copied across every
 * deterministic-id queue service. Callers keep their own `queue.add(...)`
 * options, log messages, and return values — this owns only the precheck.
 */
export async function reserveIdempotentJob(
  queue: {
    getJob(
      jobId: string,
    ): Promise<Pick<Job, 'getState' | 'remove'> | undefined>;
  },
  jobId: string,
): Promise<IdempotentJobReservation> {
  const existingJob = await queue.getJob(jobId);
  if (!existingJob) {
    return { alreadyQueued: false };
  }

  const state = await existingJob.getState();
  if (ACTIVE_JOB_STATES.has(state)) {
    return { alreadyQueued: true, state };
  }

  await existingJob.remove();
  return { alreadyQueued: false };
}
