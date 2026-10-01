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
