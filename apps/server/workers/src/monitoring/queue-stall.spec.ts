import {
  buildStalledJobLogContext,
  extractBullMqNamedEvents,
  resolveWorkerIdentity,
  STALLED_JOB_LOG_MESSAGE,
} from '@workers/monitoring/queue-stall';

describe('queue-stall', () => {
  it('extracts stall counts and job ids without reading payloads', () => {
    const extracted = extractBullMqNamedEvents(
      [
        [
          '1-0',
          ['event', 'failed', 'jobId', 'job-failed', 'data', '{"secret":1}'],
        ],
        ['2-0', ['event', 'stalled', 'jobId', 'job-stalled-1']],
        ['3-0', ['jobId', 'job-stalled-2', 'event', 'stalled']],
        ['4-0', ['event', 'stalled']],
      ],
      'stalled',
    );

    expect(extracted).toEqual({
      count: 3,
      jobIds: ['job-stalled-1', 'job-stalled-2'],
    });
    expect(JSON.stringify(extracted)).not.toContain('secret');
  });

  it('prefers the container hostname so ECS task identity is greppable', () => {
    expect(
      resolveWorkerIdentity({ HOSTNAME: 'ecs-workers-abc123' }, 'local', 42),
    ).toBe('ecs-workers-abc123:42');
    expect(resolveWorkerIdentity({}, 'macbook', 9)).toBe('macbook:9');
  });

  it('builds a stall log context with queue, job, and worker only', () => {
    const context = buildStalledJobLogContext({
      jobId: 'job-stalled-1',
      queueName: 'agent-run',
      service: 'QueueMetricsService',
      worker: 'ecs-workers-abc123:42',
    });

    expect(STALLED_JOB_LOG_MESSAGE).toBe('BullMQ job stalled');
    expect(context).toEqual({
      jobId: 'job-stalled-1',
      queueName: 'agent-run',
      service: 'QueueMetricsService',
      worker: 'ecs-workers-abc123:42',
    });
    expect(JSON.stringify(context)).not.toContain('payload');
    expect(JSON.stringify(context)).not.toContain('secret');
  });
});
