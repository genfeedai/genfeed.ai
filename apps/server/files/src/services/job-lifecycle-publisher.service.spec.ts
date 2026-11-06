import { JobLifecyclePublisherService } from '@files/services/job-lifecycle-publisher.service';
import type { RedisService } from '@libs/redis/redis.service';
import type { Queue } from 'bullmq';

type Listener = (args: Record<string, unknown>) => void;

const queueEvents = vi.hoisted(() => ({
  instances: [] as Array<{
    emit: (event: string, args: Record<string, unknown>) => void;
    isClosed: boolean;
    name: string;
  }>,
}));

vi.mock('bullmq', () => {
  class FakeQueueEvents {
    private readonly listeners = new Map<string, Listener>();
    public isClosed = false;

    constructor(public readonly name: string) {
      queueEvents.instances.push(this);
    }

    on(event: string, listener: Listener) {
      this.listeners.set(event, listener);
      return this;
    }

    emit(event: string, args: Record<string, unknown>) {
      this.listeners.get(event)?.(args);
    }

    async close() {
      this.isClosed = true;
    }
  }

  return { Queue: class {}, QueueEvents: FakeQueueEvents };
});

describe('JobLifecyclePublisherService', () => {
  let published: Array<{ channel: string; payload: Record<string, unknown> }>;
  let isRedisDown: boolean;
  let service: JobLifecyclePublisherService;

  const queue = (name: string) =>
    ({
      name,
      opts: { connection: { host: 'localhost', port: 6379 } },
    }) as unknown as Queue;

  const queueNamed = (name: string) => {
    const found = queueEvents.instances.find((events) => events.name === name);
    if (!found) {
      throw new Error(`No queue events for ${name}`);
    }
    return found;
  };

  beforeEach(() => {
    queueEvents.instances.length = 0;
    published = [];
    isRedisDown = false;

    service = new JobLifecyclePublisherService(
      {
        publish: async (channel: string, message: string) => {
          if (isRedisDown) {
            throw new Error('redis unavailable');
          }
          published.push({ channel, payload: JSON.parse(message) });
          return 1;
        },
      } as unknown as RedisService,
      queue('task-processing'),
      queue('video-processing'),
      queue('image-processing'),
      queue('file-processing'),
    );
  });

  it.each([
    ['waiting', { jobId: 'job-1' }, { status: 'waiting' }],
    [
      'active',
      { jobId: 'job-1', prev: 'waiting' },
      { prev: 'waiting', status: 'active' },
    ],
    [
      'completed',
      { jobId: 'job-1', returnvalue: '{"ok":true}' },
      { returnvalue: '{"ok":true}', status: 'completed' },
    ],
    [
      'failed',
      { failedReason: 'timeout', jobId: 'job-1' },
      { failedReason: 'timeout', status: 'failed' },
    ],
    [
      'progress',
      { data: 40, jobId: 'job-1' },
      { progress: 40, status: 'progress' },
    ],
    ['stalled', { jobId: 'job-1' }, { status: 'stalled' }],
    ['removed', { jobId: 'job-1' }, { status: 'removed' }],
  ])(
    'publishes a %s video job event to the video lifecycle channel',
    async (event, args, expected) => {
      service.onModuleInit();

      queueNamed('video-processing').emit(event, args);

      await vi.waitFor(() => expect(published).toHaveLength(1));
      expect(published[0]).toEqual({
        channel: 'job-lifecycle:video',
        payload: {
          jobId: 'job-1',
          queueType: 'video',
          timestamp: expect.any(String),
          ...expected,
        },
      });
    },
  );

  it.each([
    ['task-processing', 'job-lifecycle:task'],
    ['image-processing', 'job-lifecycle:image'],
    ['file-processing', 'job-lifecycle:file'],
  ])('routes %s events to %s', async (queueName, channel) => {
    service.onModuleInit();

    queueNamed(queueName).emit('waiting', { jobId: 'job-2' });

    await vi.waitFor(() => expect(published).toHaveLength(1));
    expect(published[0]?.channel).toBe(channel);
  });

  it('merges additional data into the published payload', async () => {
    await service.publishJobEvent('task', 'job-123', 'completed', {
      assetId: 'asset-789',
      userId: 'user-456',
    });

    expect(published).toEqual([
      {
        channel: 'job-lifecycle:task',
        payload: {
          assetId: 'asset-789',
          jobId: 'job-123',
          queueType: 'task',
          status: 'completed',
          timestamp: expect.any(String),
          userId: 'user-456',
        },
      },
    ]);
  });

  it('swallows a Redis publish failure', async () => {
    isRedisDown = true;

    await expect(
      service.publishJobEvent('task', 'job-123', 'failed'),
    ).resolves.toBeUndefined();
    expect(published).toEqual([]);
  });

  it('closes every queue listener on module destroy', async () => {
    service.onModuleInit();

    await service.onModuleDestroy();

    expect(
      queueEvents.instances.map(({ isClosed, name }) => ({ isClosed, name })),
    ).toEqual([
      { isClosed: true, name: 'task-processing' },
      { isClosed: true, name: 'video-processing' },
      { isClosed: true, name: 'image-processing' },
      { isClosed: true, name: 'file-processing' },
    ]);
  });
});
