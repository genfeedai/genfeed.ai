vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
  },
}));

import { ConfigService } from '@api/config/config.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { fal } from '@fal-ai/client';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

const mockFal = fal as unknown as {
  config: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};

describe('FalService', () => {
  let service: FalService;
  let configService: { get: ReturnType<typeof vi.fn> };
  let logger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };
  let httpService: {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };

  const buildModule = async (apiKey: string | undefined) => {
    configService = { get: vi.fn().mockReturnValue(apiKey) };
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    httpService = { get: vi.fn(), post: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FalService,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: logger },
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<FalService>(FalService);
  };

  afterEach(() => vi.clearAllMocks());

  describe('initialization', () => {
    it('should be configured when FAL_API_KEY is set', async () => {
      await buildModule('test-key');
      expect(mockFal.config).toHaveBeenCalledWith({ credentials: 'test-key' });
      expect(service.isConfigured()).toBe(true);
    });

    it('should be unconfigured when FAL_API_KEY is absent', async () => {
      await buildModule(undefined);
      expect(mockFal.config).not.toHaveBeenCalled();
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('generateImage', () => {
    beforeEach(async () => {
      await buildModule('test-key');
    });

    it('should return image from data.images array', async () => {
      mockFal.subscribe.mockResolvedValue({
        data: {
          images: [
            {
              content_type: 'image/png',
              height: 512,
              url: 'https://fal.ai/img.png',
              width: 512,
            },
          ],
        },
      });

      const result = await service.generateImage('fal-ai/flux/dev', {
        prompt: 'a cat',
      });

      expect(result.url).toBe('https://fal.ai/img.png');
      expect(result.width).toBe(512);
    });

    it('should return image from data.image fallback', async () => {
      mockFal.subscribe.mockResolvedValue({
        data: { image: { url: 'https://fal.ai/img2.png' } },
      });

      const result = await service.generateImage('fal-ai/flux/schnell', {
        prompt: 'a dog',
      });

      expect(result.url).toBe('https://fal.ai/img2.png');
    });

    it('should throw when no image in response', async () => {
      mockFal.subscribe.mockResolvedValue({ data: {} });

      await expect(
        service.generateImage('fal-ai/flux/dev', { prompt: 'x' }),
      ).rejects.toThrow(/no image/i);
    });

    it('should throw when not configured', async () => {
      await buildModule(undefined);
      await expect(
        service.generateImage('fal-ai/flux/dev', { prompt: 'x' }),
      ).rejects.toThrow(/not configured/i);
    });

    it('should log start and completion', async () => {
      mockFal.subscribe.mockResolvedValue({
        data: { images: [{ url: 'https://img.url' }] },
      });

      await service.generateImage('fal-ai/flux/dev', { prompt: 'test' });

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('generateImage started'),
        expect.any(Object),
      );
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('generateImage completed'),
        expect.any(Object),
      );
    });
  });

  describe('generateVideo', () => {
    beforeEach(async () => {
      await buildModule('test-key');
    });

    it('should return video from data.video', async () => {
      mockFal.subscribe.mockResolvedValue({
        data: {
          video: { content_type: 'video/mp4', url: 'https://fal.ai/video.mp4' },
        },
      });

      const result = await service.generateVideo('fal-ai/kling-video', {
        prompt: 'a sunset',
      });

      expect(result.url).toBe('https://fal.ai/video.mp4');
    });

    it('should return video from data.videos fallback', async () => {
      mockFal.subscribe.mockResolvedValue({
        data: { videos: [{ url: 'https://fal.ai/vid2.mp4' }] },
      });

      const result = await service.generateVideo('fal-ai/kling-video', {
        prompt: 'a beach',
      });

      expect(result.url).toBe('https://fal.ai/vid2.mp4');
    });

    it('should throw when no video in response', async () => {
      mockFal.subscribe.mockResolvedValue({ data: {} });

      await expect(
        service.generateVideo('fal-ai/kling', { prompt: 'x' }),
      ).rejects.toThrow(/no video/i);
    });

    it('should log error and rethrow on failure', async () => {
      mockFal.subscribe.mockRejectedValue(new Error('GPU unavailable'));

      await expect(
        service.generateVideo('fal-ai/kling', { prompt: 'x' }),
      ).rejects.toThrow('GPU unavailable');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('generateVideo failed'),
        expect.anything(),
      );
    });
  });

  describe('generateImage with apiKeyOverride', () => {
    beforeEach(async () => {
      await buildModule(undefined);
    });

    it('should submit and poll via HTTP when apiKeyOverride is set', async () => {
      httpService.post.mockReturnValue(of({ data: { request_id: 'req-123' } }));
      httpService.get
        .mockReturnValueOnce(of({ data: { status: 'COMPLETED' } }))
        .mockReturnValueOnce(
          of({ data: { images: [{ url: 'https://result.img' }] } }),
        );

      const result = await service.generateImage(
        'fal-ai/flux/dev',
        { prompt: 'x' },
        'my-api-key',
      );

      expect(result.url).toBe('https://result.img');
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('fal-ai/flux/dev'),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Key my-api-key' }),
        }),
      );
    });
  });
});
