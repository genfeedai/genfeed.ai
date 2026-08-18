export const STALLED_JOB_LOG_MESSAGE = 'BullMQ job stalled';
export const MAX_STALLED_JOB_IDS = 20;

export interface BullMqNamedEvents {
  count: number;
  jobIds: string[];
}

export interface StalledJobLogContext {
  jobId?: string;
  queueName: string;
  service: string;
  stalledEvents?: number;
}

export function extractBullMqNamedEvents(
  events: Array<[id: string, fields: string[]]>,
  eventName: string,
): BullMqNamedEvents {
  const jobIds: string[] = [];
  let count = 0;

  for (const event of events) {
    const fields = event[1] ?? [];
    let isMatch = false;
    let jobId: string | undefined;

    for (let index = 0; index < fields.length; index += 2) {
      const key = fields[index];
      const value = fields[index + 1];
      if (key === 'event' && value === eventName) {
        isMatch = true;
      }
      if (key === 'jobId' && typeof value === 'string' && value.length > 0) {
        jobId = value;
      }
    }

    if (!isMatch) {
      continue;
    }

    count += 1;
    if (jobId) {
      jobIds.push(jobId);
    }
  }

  return { count, jobIds };
}

export function buildStalledJobLogContext(input: {
  jobId?: string;
  queueName: string;
  service: string;
  stalledEvents?: number;
}): StalledJobLogContext {
  return {
    ...(input.jobId ? { jobId: input.jobId } : {}),
    ...(input.stalledEvents !== undefined
      ? { stalledEvents: input.stalledEvents }
      : {}),
    queueName: input.queueName,
    service: input.service,
  };
}
