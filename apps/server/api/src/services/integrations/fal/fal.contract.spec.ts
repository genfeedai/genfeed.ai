vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
  },
}));

import { fal } from '@fal-ai/client';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { FalService } from '@server/services/integrations/fal/services/fal.service';
import { PollUntilService } from '@server/shared/services/poll-until/poll-until.service';
import { of } from 'rxjs';

/**
 * Contract tests for the fal.ai integration (revenue path).
 *
 * Two transports are pinned:
 *  - the SDK path (`fal.subscribe`) used when the platform key is configured;
 *  - the hand-rolled REST queue path (`https://queue.fal.run/...`) used when a
 *    per-request BYOK api key override is supplied.
 *
 * All provider interaction is mocked/fixture-based; no network calls are made.
 * Fixtures cover success responses (images/video) and provider failure shapes
 * (queue FAILED status, empty payloads).
 *
 * To update when fal changes its API: adjust the subscribe input assertion, the
 * queue submit/status/result URL + header assertions, and the response fixtures.
 */
const mockFal = fal as unknown as {
  config: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};

describe('FalService (contract)', () => {
  let service: FalService;
  let httpService: {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };

  const buildModule = async (apiKey: string | undefined) => {
    const configService = { get: vi.fn().mockReturnValue(apiKey) };
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    httpService = { get: vi.fn(), post: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FalService,
        PollUntilService,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: logger },
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<FalService>(FalService);
  };

  afterEach(() => vi.clearAllMocks());

  describe('SDK path — fal.subscribe request/response contract', () => {
    beforeEach(async () => {
      await buildModule('platform-key');
    });

    it('calls fal.subscribe with { input, logs: false } and parses data.images[0]', async () => {
      // Success fixture: fal returns generated assets under `images`.
      mockFal.subscribe.mockResolvedValue({
        data: {
          images: [
            {
              content_type: 'image/png',
              height: 1024,
              url: 'https://fal.media/files/out.png',
              width: 1024,
            },
          ],
        },
      });

      const input = { image_size: 'square_hd', prompt: 'a red fox' };
      const result = await service.generateImage('fal-ai/flux/dev', input);

      expect(mockFal.subscribe).toHaveBeenCalledWith('fal-ai/flux/dev', {
        input,
        logs: false,
      });
      expect(result).toEqual({
        content_type: 'image/png',
        height: 1024,
        url: 'https://fal.media/files/out.png',
        width: 1024,
      });
    });

    it('parses video results from data.video', async () => {
      // Success fixture: fal video model returns a single `video` asset.
      mockFal.subscribe.mockResolvedValue({
        data: {
          video: {
            content_type: 'video/mp4',
            url: 'https://fal.media/files/out.mp4',
          },
        },
      });

      const result = await service.generateVideo('fal-ai/kling-video', {
        prompt: 'a drone shot',
      });

      expect(result).toEqual({
        content_type: 'video/mp4',
        url: 'https://fal.media/files/out.mp4',
      });
    });

    it('throws when the success payload carries no image asset', async () => {
      // Failure fixture: model completed but returned an empty payload.
      mockFal.subscribe.mockResolvedValue({ data: {} });

      await expect(
        service.generateImage('fal-ai/flux/dev', { prompt: 'x' }),
      ).rejects.toThrow(/no image/i);
    });
  });

  describe('REST queue path — BYOK override request/response contract', () => {
    beforeEach(async () => {
      // No platform key: the api-key override forces the REST queue transport.
      await buildModule(undefined);
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('submits to queue.fal.run with a Key auth header, polls status, then fetches the result', async () => {
      httpService.post.mockReturnValue(of({ data: { request_id: 'req-789' } }));
      httpService.get
        // First poll: still processing.
        .mockReturnValueOnce(of({ data: { status: 'IN_PROGRESS' } }))
        // Second poll: completed.
        .mockReturnValueOnce(of({ data: { status: 'COMPLETED' } }))
        // Result fetch.
        .mockReturnValueOnce(
          of({ data: { images: [{ url: 'https://fal.media/byok.png' }] } }),
        );

      const input = { prompt: 'byok cat' };
      const promise = service.generateImage(
        'fal-ai/flux/dev',
        input,
        'byok-secret',
      );
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.url).toBe('https://fal.media/byok.png');

      // Submit request contract.
      expect(httpService.post).toHaveBeenCalledWith(
        'https://queue.fal.run/fal-ai/flux/dev',
        { ...input },
        {
          headers: {
            Authorization: 'Key byok-secret',
            'Content-Type': 'application/json',
          },
        },
      );

      // Status + result URL contract.
      expect(httpService.get).toHaveBeenNthCalledWith(
        1,
        'https://queue.fal.run/fal-ai/flux/dev/requests/req-789/status',
        { headers: { Authorization: 'Key byok-secret' } },
      );
      expect(httpService.get).toHaveBeenNthCalledWith(
        3,
        'https://queue.fal.run/fal-ai/flux/dev/requests/req-789',
        { headers: { Authorization: 'Key byok-secret' } },
      );
    });

    it('throws when the queue reports a FAILED status', async () => {
      httpService.post.mockReturnValue(of({ data: { request_id: 'req-err' } }));
      // Failure fixture: fal queue reports terminal FAILED with an error string.
      httpService.get.mockReturnValueOnce(
        of({ data: { error: 'ValidationError', status: 'FAILED' } }),
      );

      const promise = service.generateImage(
        'fal-ai/flux/dev',
        { prompt: 'x' },
        'byok-secret',
      );
      const assertion = expect(promise).rejects.toThrow(/request failed/i);
      await vi.runAllTimersAsync();
      await assertion;
    });
  });
});
