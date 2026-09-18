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
  });
});
