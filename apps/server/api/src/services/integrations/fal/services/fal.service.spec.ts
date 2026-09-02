import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import type { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';

const falConfig = vi.fn();
const falSubscribe = vi.fn();

vi.mock('@fal-ai/client', () => ({
  fal: { config: falConfig, subscribe: falSubscribe },
}));

const { FalService } = await import('./fal.service');

function createHarness(apiKey: string | null = 'env-key') {
  const configService = {
    get: vi.fn((key: string) => (key === 'FAL_API_KEY' ? apiKey : undefined)),
  } as unknown as ConfigService;
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const get = vi.fn();
  const post = vi.fn();
  const httpService = { get, post } as unknown as HttpService;
  const poll = vi.fn().mockResolvedValue({
    attempts: 1,
    elapsedMs: 1,
    value: { status: 'COMPLETED' },
  });
  const pollUntilService = { poll } as unknown as PollUntilService;

  return {
    get,
    loggerService,
    poll,
    post,
    service: new FalService(
      configService,
      loggerService,
      httpService,
      pollUntilService,
    ),
  };
}

describe('FalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('configuration', () => {
    it('configures the SDK when an API key is present', () => {
      const { service } = createHarness();

      expect(falConfig).toHaveBeenCalledWith({ credentials: 'env-key' });
      expect(service.isConfigured()).toBe(true);
    });

    it('stays unconfigured when no API key is present', () => {
      const { service } = createHarness(null);

      expect(falConfig).not.toHaveBeenCalled();
      expect(service.isConfigured()).toBe(false);
    });

    it('refuses to generate without configuration', async () => {
      const { service } = createHarness(null);

      await expect(
        service.generateImage('fal-ai/flux', { prompt: 'a cat' }),
      ).rejects.toThrowError('fal.ai is not configured');
    });
  });

  describe('generateImage', () => {
    it('reads the first entry of an images array', async () => {
      const { service } = createHarness();
      falSubscribe.mockResolvedValue({
        data: {
          images: [
            {
              content_type: 'image/png',
              height: 512,
              url: 'https://cdn.test/a.png',
              width: 512,
            },
          ],
        },
      });

      await expect(
        service.generateImage('fal-ai/flux', { prompt: 'a cat' }),
      ).resolves.toEqual({
        content_type: 'image/png',
        height: 512,
        url: 'https://cdn.test/a.png',
        width: 512,
      });
      expect(falSubscribe).toHaveBeenCalledWith('fal-ai/flux', {
        input: { prompt: 'a cat' },
        logs: false,
      });
    });

    it('falls back to a singular image field', async () => {
      const { service } = createHarness();
      falSubscribe.mockResolvedValue({
        data: { image: { url: 'https://cdn.test/b.png' } },
      });

      await expect(
        service.generateImage('fal-ai/flux', {}),
      ).resolves.toMatchObject({ url: 'https://cdn.test/b.png' });
    });

    it('falls back to a bare url on the payload root', async () => {
      const { service } = createHarness();
      falSubscribe.mockResolvedValue({
        data: { content_type: 'image/webp', url: 'https://cdn.test/c.webp' },
      });

      await expect(
        service.generateImage('fal-ai/flux', {}),
      ).resolves.toMatchObject({
        content_type: 'image/webp',
        url: 'https://cdn.test/c.webp',
      });
    });

    it('logs and rethrows when the provider returns no image', async () => {
      const { loggerService, service } = createHarness();
      falSubscribe.mockResolvedValue({ data: {} });

      await expect(
        service.generateImage('fal-ai/flux', {}),
      ).rejects.toThrowError('fal.ai returned no image for model fal-ai/flux');
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('logs and rethrows a provider error', async () => {
      const { loggerService, service } = createHarness();
      const providerError = new Error('model unavailable');
      falSubscribe.mockRejectedValue(providerError);

      await expect(
        service.generateImage('fal-ai/flux', {}),
      ).rejects.toThrowError(providerError);
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('generateImage failed'),
        providerError,
      );
    });
  });

  describe('generateVideo', () => {
    it('reads a singular video field', async () => {
      const { service } = createHarness();
      falSubscribe.mockResolvedValue({
        data: {
          video: { content_type: 'video/mp4', url: 'https://cdn.test/a.mp4' },
        },
      });

      await expect(
        service.generateVideo('fal-ai/kling', { prompt: 'a sunset' }),
      ).resolves.toEqual({
        content_type: 'video/mp4',
        url: 'https://cdn.test/a.mp4',
      });
    });

    it('falls back to the first entry of a videos array', async () => {
      const { service } = createHarness();
      falSubscribe.mockResolvedValue({
        data: { videos: [{ url: 'https://cdn.test/b.mp4' }] },
      });

      await expect(
        service.generateVideo('fal-ai/kling', {}),
      ).resolves.toMatchObject({ url: 'https://cdn.test/b.mp4' });
    });

    it('falls back to a bare url on the payload root', async () => {
      const { service } = createHarness();
      falSubscribe.mockResolvedValue({
        data: { url: 'https://cdn.test/c.mp4' },
      });

      await expect(
        service.generateVideo('fal-ai/kling', {}),
      ).resolves.toMatchObject({ url: 'https://cdn.test/c.mp4' });
    });

    it('logs and rethrows when the provider returns no video', async () => {
      const { loggerService, service } = createHarness();
      falSubscribe.mockResolvedValue({ data: {} });

      await expect(
        service.generateVideo('fal-ai/kling', {}),
      ).rejects.toThrowError('fal.ai returned no video for model fal-ai/kling');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('run', () => {
    it('returns the raw SDK payload', async () => {
      const { service } = createHarness();
      falSubscribe.mockResolvedValue({ data: { anything: true } });

      await expect(service.run('fal-ai/any', { a: 1 })).resolves.toEqual({
        anything: true,
      });
    });

    it('refuses to run without configuration', async () => {
      const { service } = createHarness(null);

      await expect(service.run('fal-ai/any', {})).rejects.toThrowError(
        'fal.ai is not configured',
      );
    });
  });

  describe('BYOK queue path', () => {
    it('submits, polls and fetches the result over the queue API', async () => {
      const { get, poll, post, service } = createHarness();
      post.mockReturnValue(of({ data: { request_id: 'req-1' } }));
      get.mockReturnValue(of({ data: { images: [{ url: 'https://x/a' }] } }));

      await expect(
        service.generateImage('fal-ai/flux', { prompt: 'a cat' }, 'byok-key'),
      ).resolves.toMatchObject({ url: 'https://x/a' });

      expect(post).toHaveBeenCalledWith(
        'https://queue.fal.run/fal-ai/flux',
        { prompt: 'a cat' },
        {
          headers: {
            Authorization: 'Key byok-key',
            'Content-Type': 'application/json',
          },
        },
      );
      expect(poll).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledWith(
        'https://queue.fal.run/fal-ai/flux/requests/req-1',
        { headers: { Authorization: 'Key byok-key' } },
      );
      expect(falSubscribe).not.toHaveBeenCalled();
    });

    it('returns the submit payload directly when no request id comes back', async () => {
      const { get, post, service } = createHarness();
      post.mockReturnValue(
        of({ data: { images: [{ url: 'https://x/sync' }] } }),
      );

      await expect(
        service.generateImage('fal-ai/flux', {}, 'byok-key'),
      ).resolves.toMatchObject({ url: 'https://x/sync' });
      expect(get).not.toHaveBeenCalled();
    });

    it('translates a poll timeout into a fal.ai timeout error', async () => {
      const { poll, post, service } = createHarness();
      post.mockReturnValue(of({ data: { request_id: 'req-1' } }));
      poll.mockRejectedValue(new PollTimeoutException('too slow', 240_000));

      await expect(
        service.run('fal-ai/flux', {}, 'byok-key'),
      ).rejects.toThrowError('fal.ai request timed out');
    });

    it('propagates a non-timeout polling failure unchanged', async () => {
      const { poll, post, service } = createHarness();
      post.mockReturnValue(of({ data: { request_id: 'req-1' } }));
      poll.mockRejectedValue(new Error('fal.ai request failed: bad input'));

      await expect(
        service.run('fal-ai/flux', {}, 'byok-key'),
      ).rejects.toThrowError('fal.ai request failed: bad input');
    });

    it('completes only on a COMPLETED status and raises on FAILED', async () => {
      const { get, poll, post, service } = createHarness();
      post.mockReturnValue(of({ data: { request_id: 'req-1' } }));
      get.mockReturnValue(of({ data: { ok: true } }));

      await service.run('fal-ai/flux', {}, 'byok-key');

      const [fetchStatus, isDone] = poll.mock.calls[0] as [
        () => Promise<unknown>,
        (value: { status?: string; error?: string }) => boolean,
      ];

      get.mockReturnValue(of({ data: { status: 'IN_QUEUE' } }));
      await expect(fetchStatus()).resolves.toEqual({ status: 'IN_QUEUE' });
      expect(get).toHaveBeenCalledWith(
        'https://queue.fal.run/fal-ai/flux/requests/req-1/status',
        { headers: { Authorization: 'Key byok-key' } },
      );

      expect(isDone({ status: 'COMPLETED' })).toBe(true);
      expect(isDone({ status: 'IN_PROGRESS' })).toBe(false);
      expect(() => isDone({ error: 'bad input', status: 'FAILED' })).toThrow(
        'fal.ai request failed: bad input',
      );
      expect(() => isDone({ status: 'FAILED' })).toThrow(
        'fal.ai request failed: Unknown error',
      );
    });

    it('runs the BYOK path even when the SDK is unconfigured', async () => {
      const { get, post, service } = createHarness(null);
      post.mockReturnValue(of({ data: { request_id: 'req-1' } }));
      get.mockReturnValue(of({ data: { video: { url: 'https://x/a.mp4' } } }));

      await expect(
        service.generateVideo('fal-ai/kling', {}, 'byok-key'),
      ).resolves.toMatchObject({ url: 'https://x/a.mp4' });
    });
  });
});
