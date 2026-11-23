import {
  VIDEO_COMPLETION_JOB_OPTIONS,
  VideoCompletionPublisherService,
  type VideoCompletionQueueEvent,
} from '@files/services/video-completion/video-completion-publisher.service';
import { describe, expect, it } from 'vitest';

const event: VideoCompletionQueueEvent = {
  ingredientId: 'ingredient-1',
  organizationId: 'org-1',
  result: { s3Key: 'videos/ingredient-1.mp4' },
  status: 'completed',
  timestamp: '2026-11-23T08:00:00.000Z',
};

/** A queue that keeps what it is given, as Redis does, whether or not a consumer is running. */
function createQueue() {
  const stored: Array<{ data: unknown; name: string; opts: unknown }> = [];
  return {
    add: async (name: string, data: unknown, opts: unknown) => {
      stored.push({ data, name, opts });
    },
    stored,
  };
}

describe('VideoCompletionPublisherService', () => {
  it('stores the event with retries, so it survives a consumer that is not running', async () => {
    const queue = createQueue();

    await new VideoCompletionPublisherService(queue as never).publish(event);

    expect(queue.stored).toEqual([
      {
        data: event,
        name: 'video-completion',
        opts: VIDEO_COMPLETION_JOB_OPTIONS,
      },
    ]);
    expect(VIDEO_COMPLETION_JOB_OPTIONS.attempts).toBeGreaterThan(1);
  });

  it('rejects when the event was not stored, so the caller can fail its job', async () => {
    const publisher = new VideoCompletionPublisherService({
      add: async () => {
        throw new Error('Redis is down');
      },
    } as never);

    await expect(publisher.publish(event)).rejects.toThrow('Redis is down');
  });
});
