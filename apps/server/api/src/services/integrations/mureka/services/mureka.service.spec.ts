import { MurekaService } from '@api/services/integrations/mureka/services/mureka.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import type { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';

function createHarness(
  apiKey: string | null = 'env-key',
  baseUrl = 'https://api.mureka.ai',
) {
  const configValues: Record<string, string | undefined> = {
    MUREKA_API_BASE_URL: baseUrl,
    MUREKA_API_KEY: apiKey ?? undefined,
    MUREKA_MODEL: 'mureka-9',
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
    configService,
    configValues,
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
    it('submits a prompt-only song to easy-generate with Bearer auth and returns the polled audio URL', async () => {
      const { post, poll, service } = createHarness();
      post.mockReturnValue(of({ data: { id: 'task-1' } }));
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
        lyrics: '   ',
        prompt: 'a happy song',
      });

      expect(post).toHaveBeenCalledWith(
        'https://api.mureka.ai/v1/song/easy-generate',
        { model: 'mureka-9', n: 1, prompt: 'a happy song' },
        {
          maxRedirects: 0,
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
      post.mockReturnValue(of({ data: { id: 'task-1' } }));
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
      expect(() => isDone({ failed_reason: 'boom', status: 'failed' })).toThrow(
        'Mureka generation failed: boom',
      );
      expect(isDone({ status: 'running' })).toBe(false);
      expect(isDone({ status: 'streaming' })).toBe(false);
      expect(isDone({ status: 'succeeded' })).toBe(true);
    });

    it('treats timeouted and cancelled as terminal failures instead of spinning to the poll timeout', async () => {
      const { post, poll, service } = createHarness();
      post.mockReturnValue(of({ data: { id: 'task-1' } }));
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
      expect(() => isDone({ status: 'timeouted' })).toThrow(
        'Mureka generation timeouted',
      );
      expect(() => isDone({ status: 'cancelled' })).toThrow(
        'Mureka generation cancelled',
      );
    });

    it('routes an instrumental request to the dedicated instrumental endpoint', async () => {
      const { post, poll, service } = createHarness();
      post.mockReturnValue(of({ data: { id: 'task-1' } }));
      poll.mockResolvedValue({
        attempts: 1,
        elapsedMs: 1,
        value: {
          choices: [{ url: 'https://cdn.example.com/instrumental.mp3' }],
          status: 'succeeded',
        },
      });

      await service.generateSong({
        instrumental: true,
        lyrics: 'stale lyrics',
        prompt: 'a beat',
      });

      expect(post).toHaveBeenCalledWith(
        'https://api.mureka.ai/v1/instrumental/generate',
        { model: 'mureka-9', n: 1, prompt: 'a beat' },
        {
          maxRedirects: 0,
          headers: {
            Authorization: 'Bearer env-key',
            'Content-Type': 'application/json',
          },
        },
      );
    });

    it('polls the instrumental query endpoint for an instrumental task', async () => {
      const { get, post, poll, service } = createHarness();
      post.mockReturnValue(of({ data: { id: 'task-9' } }));
      get.mockReturnValue(
        of({
          data: {
            choices: [{ url: 'https://cdn.example.com/instrumental.mp3' }],
            status: 'succeeded',
          },
        }),
      );
      poll.mockImplementation(async (fetch: () => Promise<unknown>) => ({
        value: await fetch(),
      }));

      await service.generateSong({ instrumental: true, prompt: 'a beat' });

      expect(get).toHaveBeenCalledWith(
        'https://api.mureka.ai/v1/instrumental/query/task-9',
        expect.objectContaining({ maxRedirects: 0 }),
      );
    });

    it('submits lyrics to the lyrics-to-song endpoint', async () => {
      const { post, poll, service } = createHarness();
      post.mockReturnValue(of({ data: { id: 'task-1' } }));
      poll.mockResolvedValue({
        attempts: 1,
        elapsedMs: 1,
        value: {
          choices: [{ url: 'https://cdn.example.com/song.mp3' }],
          status: 'succeeded',
        },
      });

      await service.generateSong({
        lyrics: '  [Verse] hello  ',
        model: 'mureka-9.5',
        prompt: 'r&b, slow',
      });

      expect(post).toHaveBeenCalledWith(
        'https://api.mureka.ai/v1/song/generate',
        {
          lyrics: '[Verse] hello',
          model: 'mureka-9.5',
          n: 1,
          prompt: 'r&b, slow',
        },
        expect.objectContaining({ maxRedirects: 0 }),
      );
    });

    it('refuses an over-long prompt before any HTTP call', async () => {
      const { post, service } = createHarness();

      await expect(
        service.generateSong({
          lyrics: '[Verse] hi',
          prompt: 'a'.repeat(1025),
        }),
      ).rejects.toThrow('Mureka prompt exceeds 1024 characters');
      expect(post).not.toHaveBeenCalled();
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
      post.mockReturnValue(of({ data: { id: 'task-1' } }));
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
      post.mockReturnValue(of({ data: { id: 'task-1' } }));
      poll.mockRejectedValue(new PollTimeoutException('timeout', 180_000));

      await expect(service.generateSong({ prompt: 'a song' })).rejects.toThrow(
        'Mureka generation timed out',
      );
    });

    it('throws when the completed response has no audio URL', async () => {
      const { post, poll, service } = createHarness();
      post.mockReturnValue(of({ data: { id: 'task-1' } }));
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

describe('Mureka HTTPS transport boundary', () => {
  it.each([
    'http://example.com',
    'ftp://example.com',
    '/relative',
    'invalid',
    'https://user:password@example.com',
    'https://example.com?token=secret',
  ])(
    'rejects invalid base URL before credentials or HTTP: %s',
    async (baseUrl) => {
      const harness = createHarness('private-key', baseUrl);
      await expect(
        harness.service.generateSong({ prompt: 'music' }),
      ).rejects.toThrow('Mureka base URL must be');
      expect(harness.configService.get).not.toHaveBeenCalledWith(
        'MUREKA_API_KEY',
      );
      expect(harness.post).not.toHaveBeenCalled();
      expect(harness.get).not.toHaveBeenCalled();
    },
  );

  it('captures HTTPS path prefix once and disables submission and polling redirects', async () => {
    const harness = createHarness('env-key', 'https://example.com/music///');
    harness.post.mockReturnValue(of({ data: { id: 'task-1' } }));
    harness.get.mockReturnValue(
      of({
        data: {
          status: 'succeeded',
          choices: [{ url: 'https://cdn.example.com/music.mp3' }],
        },
      }),
    );
    harness.poll.mockImplementation(async (fetch: () => Promise<unknown>) => {
      harness.configValues.MUREKA_API_BASE_URL = 'http://changed.example.com';
      return { value: await fetch() };
    });
    await harness.service.generateSong({ prompt: 'music' });
    expect(harness.post).toHaveBeenCalledWith(
      'https://example.com/music/v1/song/easy-generate',
      expect.any(Object),
      expect.objectContaining({ maxRedirects: 0 }),
    );
    expect(harness.get).toHaveBeenCalledWith(
      'https://example.com/music/v1/song/query/task-1',
      expect.objectContaining({
        maxRedirects: 0,
        headers: expect.objectContaining({ Authorization: 'Bearer env-key' }),
      }),
    );
    expect(harness.configService.get).toHaveBeenCalledWith(
      'MUREKA_API_BASE_URL',
    );
    expect(
      vi
        .mocked(harness.configService.get)
        .mock.calls.filter(([key]) => key === 'MUREKA_API_BASE_URL'),
    ).toHaveLength(1);
  });
});
