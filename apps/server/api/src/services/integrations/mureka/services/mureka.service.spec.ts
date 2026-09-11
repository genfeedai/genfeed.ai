import { MurekaService } from '@api/services/integrations/mureka/services/mureka.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import type { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';

function createHarness(apiKey: string | null = 'env-key') {
  const configValues: Record<string, string | undefined> = {
    MUREKA_API_BASE_URL: 'https://platform.mureka.ai',
    MUREKA_API_KEY: apiKey ?? undefined,
    MUREKA_MODEL: 'V9',
  };
  const configService = {
    get: vi.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const get = vi.fn();
  const post = vi.fn();
  const httpService = { get, post } as unknown as HttpService;
  const poll = vi.fn();
  const pollUntilService = { poll } as unknown as PollUntilService;

  return {
    get,
    poll,
    post,
    service: new MurekaService(
      configService,
      loggerService,
      httpService,
      pollUntilService,
    ),
  };
}

describe('MurekaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('configuration', () => {
    it('is configured when an API key is present', () => {
      const { service } = createHarness();
      expect(service.isConfigured()).toBe(true);
    });

    it('stays unconfigured with no API key', () => {
      const { service } = createHarness(null);
      expect(service.isConfigured()).toBe(false);
    });

    it('refuses to generate without configuration', async () => {
      const { service } = createHarness(null);

      await expect(
        service.generateSong({ prompt: 'a happy song' }),
      ).rejects.toThrow('Mureka is not configured');
    });
  });

  describe('generateSong', () => {
    it('submits the request with Bearer auth and returns the polled audio URL', async () => {
      const { post, poll, service } = createHarness();
      post.mockReturnValue(of({ data: { task_id: 'task-1' } }));
      poll.mockResolvedValue({
        attempts: 1,
        elapsedMs: 1,
        value: {
          choices: [{ url: 'https://cdn.mureka.example.com/song.mp3' }],
          status: 'succeeded',
        },
      });

      const result = await service.generateSong({
        instrumental: false,
        prompt: 'a happy song',
      });

      expect(post).toHaveBeenCalledWith(
        'https://platform.mureka.ai/v1/song/generate',
        expect.objectContaining({
          instrumental: false,
          model: 'V9',
          prompt: 'a happy song',
        }),
        {
          headers: {
            Authorization: 'Bearer env-key',
            'Content-Type': 'application/json',
          },
        },
      );
      expect(result).toEqual({
        audioUrl: 'https://cdn.mureka.example.com/song.mp3',
        taskId: 'task-1',
      });
    });

    it('builds an isDone predicate that throws on a failed status and stops otherwise', async () => {
      const { post, poll, service } = createHarness();
      post.mockReturnValue(of({ data: { task_id: 'task-1' } }));
      poll.mockResolvedValue({
        attempts: 1,
        elapsedMs: 1,
        value: {
          choices: [{ url: 'https://cdn.example.com/x.mp3' }],
          status: 'succeeded',
        },
      });

      await service.generateSong({ prompt: 'a song' });

      const isDone = poll.mock.calls[0][1] as (data: unknown) => boolean;
      expect(() => isDone({ error: 'boom', status: 'failed' })).toThrow(
        'Mureka generation failed: boom',
      );
      expect(isDone({ status: 'processing' })).toBe(false);
      expect(isDone({ status: 'succeeded' })).toBe(true);
      expect(isDone({ status: 'completed' })).toBe(true);
    });

    it('throws when the generate response has no task id', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: {} }));

      await expect(service.generateSong({ prompt: 'a song' })).rejects.toThrow(
        'Mureka returned no task id',
      );
    });

    it('propagates the predicate failure raised while polling', async () => {
      const { post, poll, service } = createHarness();
      post.mockReturnValue(of({ data: { task_id: 'task-1' } }));
      // PollUntilService.poll itself rejects when the isDone predicate throws
      // — see the real service's own failure-status check — so mocking a
      // rejection here exercises the same call-site handling directly.
      poll.mockRejectedValue(new Error('Mureka generation failed: boom'));

      await expect(service.generateSong({ prompt: 'a song' })).rejects.toThrow(
        'Mureka generation failed: boom',
      );
    });

    it('maps a poll timeout to a clear error', async () => {
      const { post, poll, service } = createHarness();
      post.mockReturnValue(of({ data: { task_id: 'task-1' } }));
      poll.mockRejectedValue(new PollTimeoutException('timeout', 180_000));

      await expect(service.generateSong({ prompt: 'a song' })).rejects.toThrow(
        'Mureka generation timed out',
      );
    });

    it('throws when the completed response has no audio URL', async () => {
      const { post, poll, service } = createHarness();
      post.mockReturnValue(of({ data: { task_id: 'task-1' } }));
      poll.mockResolvedValue({
        attempts: 1,
        elapsedMs: 1,
        value: { choices: [], status: 'succeeded' },
      });

      await expect(service.generateSong({ prompt: 'a song' })).rejects.toThrow(
        'Mureka completed with no audio URL',
      );
    });
  });
});
