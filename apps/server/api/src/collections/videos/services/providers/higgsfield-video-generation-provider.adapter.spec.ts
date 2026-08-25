import { HiggsFieldVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/higgsfield-video-generation-provider.adapter';
import type { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { MODEL_KEYS } from '@genfeedai/constants';

describe('HiggsFieldVideoGenerationProviderAdapter', () => {
  function buildAdapter(higgsFieldService: Partial<HiggsFieldService>) {
    return new HiggsFieldVideoGenerationProviderAdapter(
      higgsFieldService as unknown as HiggsFieldService,
    );
  }

  describe('supports', () => {
    it('matches the Higgsfield Kling video model key', () => {
      const adapter = buildAdapter({});
      expect(adapter.supports(MODEL_KEYS.HIGGSFIELD_KLING_VIDEO)).toBe(true);
    });

    it('rejects other model keys', () => {
      const adapter = buildAdapter({});
      expect(adapter.supports('klingai/v2/pro/image-to-video')).toBe(false);
    });
  });

  describe('generate', () => {
    it('throws when no source imageUrl is provided', async () => {
      const adapter = buildAdapter({});

      await expect(
        adapter.generate({
          model: MODEL_KEYS.HIGGSFIELD_KLING_VIDEO,
          prompt: 'a dog running on the beach',
        }),
      ).rejects.toThrow(
        'Higgsfield video generation requires a source imageUrl',
      );
    });

    it('queues the image-to-video job, polls to completion, and returns the resolved video URL', async () => {
      const generateImageToVideo = vi
        .fn()
        .mockResolvedValue({ requestId: 'req-123' });
      const waitForCompletion = vi
        .fn()
        .mockResolvedValue({ videoUrl: 'https://cdn.test/out.mp4' });
      const adapter = buildAdapter({
        generateImageToVideo,
        waitForCompletion,
      });

      const result = await adapter.generate({
        duration: 5,
        height: 1920,
        imageUrl: 'https://cdn.test/start.png',
        model: MODEL_KEYS.HIGGSFIELD_KLING_VIDEO,
        organizationId: 'org-1',
        prompt: 'a dog running on the beach',
        width: 1080,
      });

      expect(generateImageToVideo).toHaveBeenCalledWith({
        aspectRatio: '9:16',
        duration: 5,
        imageUrl: 'https://cdn.test/start.png',
        modelId: MODEL_KEYS.HIGGSFIELD_KLING_VIDEO,
        organizationId: 'org-1',
        prompt: 'a dog running on the beach',
      });
      expect(waitForCompletion).toHaveBeenCalledWith('req-123', {
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
