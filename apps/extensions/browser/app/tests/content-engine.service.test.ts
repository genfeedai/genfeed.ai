import { describe, expect, it, vi } from 'vitest';

import { ContentEngineService } from '~services/content-engine.service';

describe('ContentEngineService', () => {
  it('executes and polls a run until terminal status', async () => {
    const createAndExecuteRun = vi.fn().mockResolvedValue({
      _id: 'run_1',
      actionType: 'generate',
      progress: 1,
      status: 'running',
    });

    const getRun = vi
      .fn()
      .mockResolvedValueOnce({
        _id: 'run_1',
        actionType: 'generate',
        progress: 50,
        status: 'running',
      })
      .mockResolvedValueOnce({
        _id: 'run_1',
        actionType: 'generate',
        progress: 100,
        status: 'completed',
      });

    const getRunEvents = vi
      .fn()
      .mockResolvedValueOnce([
        {
          createdAt: '2026-02-10T10:00:00.000Z',
          message: 'Run started',
          type: 'run.started',
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: '2026-02-10T10:00:01.000Z',
          message: 'Run finished',
          type: 'run.completed',
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: '2026-02-10T10:00:01.000Z',
          message: 'Run finished',
          type: 'run.completed',
        },
      ]);

    const service = new ContentEngineService({
      createAndExecuteRun,
      getRun,
      getRunEvents,
    } as never);

    const updates: Array<{ progress: number; status: string }> = [];

    const result = await service.executeRunLoop({
      actionType: 'generate',
      input: { prompt: 'Write a post' },
      onUpdate: ({ run }) => {
        updates.push({ progress: run.progress, status: run.status });
      },
      pollIntervalMs: 1,
    });

    expect(createAndExecuteRun).toHaveBeenCalledTimes(1);
    expect(getRun).toHaveBeenCalledTimes(2);
    expect(getRunEvents).toHaveBeenCalledTimes(3);
    expect(result.run.status).toBe('completed');
    expect(updates.length).toBeGreaterThanOrEqual(2);
  });

  it('throws when max polls is exceeded', async () => {
    const service = new ContentEngineService({
      createAndExecuteRun: vi.fn().mockResolvedValue({
        _id: 'run_2',
        actionType: 'post',
        progress: 1,
        status: 'running',
      }),
      getRun: vi.fn().mockResolvedValue({
        _id: 'run_2',
        actionType: 'post',
        progress: 20,
        status: 'running',
      }),
      getRunEvents: vi.fn().mockResolvedValue([]),
    } as never);

    await expect(
      service.executeRunLoop({
        actionType: 'post',
        input: { payload: 'content' },
        maxPolls: 1,
        pollIntervalMs: 1,
      }),
    ).rejects.toThrow('did not reach a terminal state');
  });
});
