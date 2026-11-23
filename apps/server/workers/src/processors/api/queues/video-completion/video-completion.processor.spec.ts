import { Status } from '@genfeedai/contracts';
import { ConflictException } from '@nestjs/common';
import { VideoCompletionProcessor } from '@workers/processors/api/queues/video-completion/video-completion.processor';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

const event = {
  ingredientId: 'ingredient-1',
  organizationId: 'org-1',
  status: Status.COMPLETED,
  timestamp: '2026-11-23T08:00:00.000Z',
};

function setup(handle: (data: unknown) => Promise<void>) {
  const settled: unknown[] = [];
  const logger = { warn: vi.fn() };
  const processor = new VideoCompletionProcessor(
    {
      handleVideoCompletion: async (data: unknown) => {
        await handle(data);
        settled.push(data);
      },
    } as never,
    logger as never,
  );
  const run = (data: unknown) =>
    processor.process({ data, id: 'job-1' } as Job<unknown>);
  return { logger, run, settled };
}

describe('VideoCompletionProcessor', () => {
  it('settles an event that waited in the queue until a consumer started', async () => {
    const { run, settled } = setup(async () => undefined);

    await run(event);

    expect(settled).toEqual([event]);
  });

  it.each([
    null,
    {},
    { ...event, status: 'pending' },
    { ...event, organizationId: undefined },
  ])(
    'drops a payload that is not an event, without a retry: %j',
    async (data) => {
      const { run, settled } = setup(async () => undefined);

      await expect(run(data)).resolves.toBeUndefined();
      expect(settled).toEqual([]);
    },
  );

  it('rejects a failed settlement so the queue runs it again', async () => {
    const { run, settled } = setup(async () => {
      throw new Error('database unavailable');
    });

    await expect(run(event)).rejects.toThrow('database unavailable');
    expect(settled).toEqual([]);
  });

  it('does not retry a render another writer already owns', async () => {
    const { run } = setup(async () => {
      throw new ConflictException('Render job no longer owns this project');
    });

    await expect(run(event)).resolves.toBeUndefined();
  });
});
