import { HiggsFieldVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/higgsfield-video-generation-provider.adapter';
import type { DispatchVideoGenerationParams } from '@api/collections/videos/services/video-generation.types';
import type { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';

function buildParams(
  overrides: Partial<DispatchVideoGenerationParams> = {},
): DispatchVideoGenerationParams {
  return {
    height: 1920,
    model: MODEL_KEYS.HIGGSFIELD_DOP_TURBO,
    prompt: 'a dog running on the beach',
    promptParams: {
      prompt: 'a dog running on the beach',
    },
    width: 1080,
    ...overrides,
  };
}

describe('HiggsFieldVideoGenerationProviderAdapter', () => {
  function buildAdapter(higgsFieldService: Partial<HiggsFieldService>) {
    return new HiggsFieldVideoGenerationProviderAdapter(
      higgsFieldService as unknown as HiggsFieldService,
    );
  }

  describe('supports', () => {
    it('matches every DoP quality tier', () => {
      const adapter = buildAdapter({});
      expect(adapter.supports(MODEL_KEYS.HIGGSFIELD_DOP_LITE)).toBe(true);
      expect(adapter.supports(MODEL_KEYS.HIGGSFIELD_DOP_TURBO)).toBe(true);
      expect(adapter.supports(MODEL_KEYS.HIGGSFIELD_DOP_STANDARD)).toBe(true);
    });

    it('rejects the Soul image model key', () => {
      const adapter = buildAdapter({});
      expect(adapter.supports(MODEL_KEYS.HIGGSFIELD_SOUL)).toBe(false);
    });

    it('rejects other model keys', () => {
      const adapter = buildAdapter({});
      expect(adapter.supports('klingai/v2/pro/image-to-video')).toBe(false);
    });

    it('matches Genjutsu and the legacy misspelled endpoint', () => {
      const adapter = buildAdapter({});
      expect(adapter.supports(MODEL_KEYS.HIGGSFIELD_GENJUTSU)).toBe(true);
      expect(adapter.supports('higgsfiled/genjutsu/motion-transfer/v1.0')).toBe(
        true,
      );
    });
  });

  describe('Genjutsu object swap and restyle', () => {
    it('matches both new endpoints', () => {
      const adapter = buildAdapter({});
      expect(adapter.supports(MODEL_KEYS.HIGGSFIELD_GENJUTSU_OBJECT_SWAP)).toBe(
        true,
      );
      expect(adapter.supports(MODEL_KEYS.HIGGSFIELD_GENJUTSU_RESTYLE)).toBe(
        true,
      );
    });

    it('sends object swap with the clip and reference stills', async () => {
      const generateObjectSwap = vi
        .fn()
        .mockResolvedValue({ requestId: 'req-swap' });
      const waitForVideoCompletion = vi
        .fn()
        .mockResolvedValue({ videoUrl: 'https://cdn.test/swap.mp4' });
      const adapter = buildAdapter({
        generateObjectSwap,
        waitForVideoCompletion,
      });

      const result = await adapter.generate(
        buildParams({
          imageUrl: 'https://cdn.test/mug.png',
          model: MODEL_KEYS.HIGGSFIELD_GENJUTSU_OBJECT_SWAP,
          organizationId: 'org-1',
          prompt: 'swap the mug',
          promptParams: {
            prompt: 'swap the mug',
            reference_video: 'https://cdn.test/desk.mp4',
          },
        }),
      );

      expect(generateObjectSwap).toHaveBeenCalledWith({
        imageUrls: ['https://cdn.test/mug.png'],
        onProviderSubmissionStarted: undefined,
        organizationId: 'org-1',
        prompt: 'swap the mug',
        videoUrl: 'https://cdn.test/desk.mp4',
      });
      expect(result.externalId).toBe('https://cdn.test/swap.mp4');
    });

    it('sends restyle with the preset and optional stills', async () => {
      const generateRestyle = vi
        .fn()
        .mockResolvedValue({ requestId: 'req-style' });
      const waitForVideoCompletion = vi
        .fn()
        .mockResolvedValue({ videoUrl: 'https://cdn.test/style.mp4' });
      const adapter = buildAdapter({ generateRestyle, waitForVideoCompletion });

      const result = await adapter.generate(
        buildParams({
          model: MODEL_KEYS.HIGGSFIELD_GENJUTSU_RESTYLE,
          organizationId: 'org-1',
          prompt: 'keep the motion',
          promptParams: {
            preset_id: 'c2143317-f28d-4c3c-a0b8-39bd547e08a7',
            prompt: 'keep the motion',
            reference_video: 'https://cdn.test/walk.mp4',
            resolution: '480p',
          },
        }),
      );

      expect(generateRestyle).toHaveBeenCalledWith({
        imageUrls: [],
        onProviderSubmissionStarted: undefined,
        organizationId: 'org-1',
        presetId: 'c2143317-f28d-4c3c-a0b8-39bd547e08a7',
        prompt: 'keep the motion',
        resolution: '480p',
        videoUrl: 'https://cdn.test/walk.mp4',
      });
      expect(result.externalId).toBe('https://cdn.test/style.mp4');
    });

    it('rejects restyle without a preset before calling Higgsfield', async () => {
      const generateRestyle = vi.fn();
      const adapter = buildAdapter({ generateRestyle });

      await expect(
        adapter.generate(
          buildParams({
            model: MODEL_KEYS.HIGGSFIELD_GENJUTSU_RESTYLE,
            promptParams: { reference_video: 'https://cdn.test/walk.mp4' },
          }),
        ),
      ).rejects.toThrow('style preset id');
      expect(generateRestyle).not.toHaveBeenCalled();
    });
  });

  describe('Cinema Studio', () => {
    it('matches the Cinema Studio 4.0 endpoint', () => {
      expect(
        buildAdapter({}).supports(MODEL_KEYS.HIGGSFIELD_CINEMA_STUDIO),
      ).toBe(true);
    });

    it('submits text-to-video without a source image and returns the accepted request id to poll', async () => {
      const generateImageToVideo = vi.fn();
      const generateCinemaStudioVideo = vi
        .fn()
        .mockResolvedValue({ requestId: 'req-cinema' });
      const waitForVideoCompletion = vi
        .fn()
        .mockResolvedValue({ videoUrl: 'https://cdn.test/cinema.mp4' });
      const adapter = buildAdapter({
        generateCinemaStudioVideo,
        generateImageToVideo,
        waitForVideoCompletion,
      });

      const result = await adapter.generate(
        buildParams({
          idempotencyKey: 'video-generation-ingredient-1',
          model: MODEL_KEYS.HIGGSFIELD_CINEMA_STUDIO,
          organizationId: 'org-1',
          prompt: 'rain on neon',
          promptParams: {
            aspect_ratio: '21:9',
            duration: 8,
            image_urls: ['https://cdn.test/a.png'],
            prompt: 'rain on neon',
            reference_video_urls: ['https://cdn.test/ref.mp4'],
            resolution: '480p',
          },
        }),
      );

      expect(generateImageToVideo).not.toHaveBeenCalled();
      expect(generateCinemaStudioVideo).toHaveBeenCalledWith({
        aspectRatio: '21:9',
        duration: 8,
        idempotencyKey: 'video-generation-ingredient-1',
        imageUrls: ['https://cdn.test/a.png'],
        onProviderSubmissionStarted: undefined,
        organizationId: 'org-1',
        prompt: 'rain on neon',
        resolution: '480p',
        videoUrls: ['https://cdn.test/ref.mp4'],
      });
      // The wait moves to a durable poll job so the accepted id is never held
      // only in this process.
      expect(waitForVideoCompletion).not.toHaveBeenCalled();
      expect(result).toEqual({
        completion: 'polling',
        externalId: 'req-cinema',
        provider: 'higgsfield',
      });
    });
  });

  describe('Cinema Studio reference validation', () => {
    it.each([
      [
        'image_urls',
        { image_urls: ['https://cdn.test/a.png', 'http://x/b.png'] },
      ],
      ['image_urls', { image_urls: ['https://cdn.test/a.png', 42] }],
      [
        'reference_video_urls',
        { reference_video_urls: ['ftp://cdn.test/r.mp4'] },
      ],
      ['audio_urls', { audio_urls: ['not-a-url'] }],
    ])(
      'rejects an invalid %s entry instead of dropping it',
      async (field, extra) => {
        const generateCinemaStudioVideo = vi.fn();
        const adapter = buildAdapter({ generateCinemaStudioVideo });

        const request = adapter.generate(
          buildParams({
            model: MODEL_KEYS.HIGGSFIELD_CINEMA_STUDIO,
            organizationId: 'org-1',
            prompt: 'rain on neon',
            promptParams: { prompt: 'rain on neon', ...extra },
          }),
        );

        await expect(request).rejects.toBeInstanceOf(BadRequestException);
        await expect(request).rejects.toThrow(field);
        expect(generateCinemaStudioVideo).not.toHaveBeenCalled();
      },
    );
  });

  describe('generate', () => {
    it('rejects a missing source imageUrl as a bad request before provider dispatch', async () => {
      const generateImageToVideo = vi.fn();
      const adapter = buildAdapter({ generateImageToVideo });

      const request = adapter.generate(buildParams());

      await expect(request).rejects.toBeInstanceOf(BadRequestException);
      await expect(request).rejects.toThrow(
        'Higgsfield video generation requires a source imageUrl',
      );
      expect(generateImageToVideo).not.toHaveBeenCalled();
    });

    it('queues the image-to-video job, polls to completion, and returns the resolved video URL', async () => {
      const generateImageToVideo = vi
        .fn()
        .mockResolvedValue({ requestId: 'req-123' });
      const waitForVideoCompletion = vi
        .fn()
        .mockResolvedValue({ videoUrl: 'https://cdn.test/out.mp4' });
      const adapter = buildAdapter({
        generateImageToVideo,
        waitForVideoCompletion,
      });

      const result = await adapter.generate(
        buildParams({
          duration: 5,
          imageUrl: 'https://cdn.test/start.png',
          organizationId: 'org-1',
        }),
      );

      expect(generateImageToVideo).toHaveBeenCalledWith({
        onProviderSubmissionStarted: undefined,
        imageUrl: 'https://cdn.test/start.png',
        modelKey: MODEL_KEYS.HIGGSFIELD_DOP_TURBO,
        organizationId: 'org-1',
        prompt: 'a dog running on the beach',
      });
      expect(waitForVideoCompletion).toHaveBeenCalledWith('req-123', {
        organizationId: 'org-1',
      });
      expect(result).toEqual({
        completion: 'remote-output',
        externalId: 'https://cdn.test/out.mp4',
        provider: 'higgsfield',
      });
    });

    it('sends Genjutsu motion transfer instead of DoP image-to-video', async () => {
      const generateImageToVideo = vi.fn();
      const generateMotionTransfer = vi
        .fn()
        .mockResolvedValue({ requestId: 'req-gen' });
      const waitForVideoCompletion = vi
        .fn()
        .mockResolvedValue({ videoUrl: 'https://cdn.test/gen.mp4' });
      const adapter = buildAdapter({
        generateImageToVideo,
        generateMotionTransfer,
        waitForVideoCompletion,
      });

      const result = await adapter.generate(
        buildParams({
          imageUrl: 'https://cdn.test/face.png',
          model: MODEL_KEYS.HIGGSFIELD_GENJUTSU,
          organizationId: 'org-1',
          prompt: 'keep the walk',
          promptParams: {
            image_urls: ['https://cdn.test/alt.png'],
            prompt: 'keep the walk',
            reference_video: 'https://cdn.test/walk.mp4',
            resolution: '720p',
          },
        }),
      );

      expect(generateImageToVideo).not.toHaveBeenCalled();
      expect(generateMotionTransfer).toHaveBeenCalledWith({
        imageUrls: ['https://cdn.test/alt.png', 'https://cdn.test/face.png'],
        onProviderSubmissionStarted: undefined,
        organizationId: 'org-1',
        prompt: 'keep the walk',
        resolution: '720p',
        videoUrl: 'https://cdn.test/walk.mp4',
      });
      expect(result).toEqual({
        completion: 'remote-output',
        externalId: 'https://cdn.test/gen.mp4',
        provider: 'higgsfield',
      });
    });
  });
});
