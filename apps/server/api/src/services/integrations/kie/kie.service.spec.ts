import type { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import type { ConfigService } from '@libs/config/config.service';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KieService } from './kie.service';

afterEach(() => vi.unstubAllGlobals());
function fixture(key = 'test-key') {
  const config = { get: vi.fn().mockReturnValue(key) };
  const polling = {
    poll: vi.fn().mockImplementation(async (fetchTask, done) => {
      const value = await fetchTask();
      if (!done(value)) throw new Error('not terminal');
      return { value };
    }),
  };
  return {
    service: new KieService(
      config as unknown as ConfigService,
      polling as unknown as PollUntilService,
    ),
    polling,
  };
}
describe('Kie.ai video integration', () => {
  it('submits once and normalizes a validated successful task output', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 200, data: { taskId: 'task-1' } })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            data: {
              taskId: 'task-1',
              state: 'success',
              resultJson: JSON.stringify({
                resultUrls: ['https://cdn.example.com/video.mp4'],
              }),
            },
          }),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const f = fixture();
    const started = vi.fn();
    await expect(
      f.service.generateVideo(
        'kling-3.0/video',
        { prompt: 'A sunrise' },
        started,
      ),
    ).resolves.toBe('https://cdn.example.com/video.mp4');
    expect(started).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].body).toBe(
      JSON.stringify({
        model: 'kling-3.0/video',
        input: { prompt: 'A sunrise' },
      }),
    );
  });
  it('does not submit without a configured platform connection', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      fixture('').service.generateVideo('model', {}),
    ).rejects.toThrow('not configured');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects provider failures and mismatched receipts', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 200, data: { taskId: 'task-1' } })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            data: { taskId: 'other-task', state: 'success' },
          }),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(fixture().service.generateVideo('model', {})).rejects.toThrow(
      'invalid task receipt',
    );
  });
});
