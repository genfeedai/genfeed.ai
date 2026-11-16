import type { ImageGenerationProviderRequest } from '@api/collections/images/services/image-generation.types';
import { resolveImageGenerationProvider } from '@api/collections/images/services/image-generation-provider.util';
import { HiggsFieldImageGenerationProviderAdapter } from '@api/collections/images/services/providers/higgsfield-image-generation-provider.adapter';
import type { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';

describe('HiggsFieldImageGenerationProviderAdapter', () => {
  function buildAdapter(higgsFieldService: Partial<HiggsFieldService>) {
    return new HiggsFieldImageGenerationProviderAdapter(
      higgsFieldService as unknown as HiggsFieldService,
    );
  }

  describe('dispatch', () => {
    it('is resolved for the Higgsfield Soul model key', () => {
      expect(resolveImageGenerationProvider(MODEL_KEYS.HIGGSFIELD_SOUL)).toBe(
        buildAdapter({}).provider,
      );
    });

    it.each([
      MODEL_KEYS.HIGGSFIELD_SOUL_STANDARD,
      MODEL_KEYS.HIGGSFIELD_SOUL_CINEMA,
      MODEL_KEYS.HIGGSFIELD_ADS_STUDIO,
    ])('is resolved for %s', (modelKey) => {
      expect(resolveImageGenerationProvider(modelKey)).toBe(
        buildAdapter({}).provider,
      );
    });

    it('is not resolved for other model keys', () => {
      expect(
        resolveImageGenerationProvider('klingai/v2/pro/text-to-image'),
      ).not.toBe(buildAdapter({}).provider);
    });
  });

  describe('prepare', () => {
    it.each([2, 3, 4])(
      'rejects unsupported native cardinality before provider submission (%s)',
      async (outputs) => {
        const generateTextToImage = vi.fn();
        const adapter = buildAdapter({ generateTextToImage });
        await expect(
          adapter.prepare({ outputs } as ImageGenerationProviderRequest),
        ).rejects.toThrow('one funded output');
        expect(generateTextToImage).not.toHaveBeenCalled();
      },
    );

    it('submits Soul Cinema on its own endpoint', async () => {
      const generateTextToImage = vi
        .fn()
        .mockResolvedValue({ requestId: 'req-cinema' });
      const waitForImageCompletion = vi
        .fn()
        .mockResolvedValue({ imageUrls: ['https://cdn.test/c.png'] });
      const adapter = buildAdapter({
        generateTextToImage,
        waitForImageCompletion,
      });

      const provider = await adapter.prepare({
        height: 1080,
        model: MODEL_KEYS.HIGGSFIELD_SOUL_CINEMA,
        organizationId: 'org-1',
        outputs: 1,
        prompt: 'night street',
        promptId: 'prompt-2',
        width: 1080,
      } as unknown as ImageGenerationProviderRequest);
      const result = await provider.generate();

      expect(generateTextToImage).toHaveBeenCalledWith(
        expect.objectContaining({
          modelKey: MODEL_KEYS.HIGGSFIELD_SOUL_CINEMA,
        }),
      );
      expect(result.outputUrls).toEqual(['https://cdn.test/c.png']);
    });

    it('submits one Ads Studio concept with a supported ratio and returns its image', async () => {
      const generateAdsStudioImages = vi
        .fn()
        .mockResolvedValue({ requestId: 'req-ads' });
      const waitForImageCompletion = vi
        .fn()
        .mockResolvedValue({ imageUrls: ['https://cdn.test/ad.png'] });
      const adapter = buildAdapter({
        generateAdsStudioImages,
        waitForImageCompletion,
      });

      const provider = await adapter.prepare({
        height: 1920,
        model: MODEL_KEYS.HIGGSFIELD_ADS_STUDIO,
        organizationId: 'org-1',
        outputs: 1,
        prompt: 'tea tin ad',
        promptId: 'prompt-3',
        width: 1080,
      } as unknown as ImageGenerationProviderRequest);
      const result = await provider.generate();

      expect(generateAdsStudioImages).toHaveBeenCalledWith({
        aspectRatio: '9:16',
        batchSize: 1,
        organizationId: 'org-1',
        prompt: 'tea tin ad',
      });
      expect(result).toEqual({
        externalId: 'req-ads',
        kind: 'external-id',
        outputUrls: ['https://cdn.test/ad.png'],
        promptId: 'prompt-3',
      });
    });

    it('queues the text-to-image job, polls to completion, and resolves outputUrls for finalization', async () => {
      const generateTextToImage = vi
        .fn()
        .mockResolvedValue({ requestId: 'req-456' });
      const waitForImageCompletion = vi.fn().mockResolvedValue({
        imageUrls: ['https://cdn.test/a.png'],
      });
      const adapter = buildAdapter({
        generateTextToImage,
        waitForImageCompletion,
      });

      const provider = await adapter.prepare({
        height: 1920,
        model: MODEL_KEYS.HIGGSFIELD_SOUL,
        organizationId: 'org-1',
        outputs: 1,
        prompt: 'studio product shot',
        promptId: 'prompt-1',
        width: 1080,
      } as unknown as ImageGenerationProviderRequest);

      expect(provider.completionKind).toBe('poll-single');
      expect(provider.outputStrategy).toBe('single');

      const result = await provider.generate();

      expect(generateTextToImage).toHaveBeenCalledWith({
        aspectRatio: '9:16',
        batchSize: 1,
        modelKey: MODEL_KEYS.HIGGSFIELD_SOUL,
        organizationId: 'org-1',
        prompt: 'studio product shot',
      });
      expect(waitForImageCompletion).toHaveBeenCalledWith('req-456', {
        organizationId: 'org-1',
      });
      expect(result).toEqual({
        externalId: 'req-456',
        kind: 'external-id',
        outputUrls: ['https://cdn.test/a.png'],
        promptId: 'prompt-1',
      });
    });

    it('omits the reference image when the request carries none', async () => {
      const generateTextToImage = vi
        .fn()
        .mockResolvedValue({ requestId: 'req-789' });
      const waitForImageCompletion = vi
        .fn()
        .mockResolvedValue({ imageUrls: ['https://cdn.test/a.png'] });
      const adapter = buildAdapter({
        generateTextToImage,
        waitForImageCompletion,
      });

      const provider = await adapter.prepare({
        height: 1024,
        model: MODEL_KEYS.HIGGSFIELD_SOUL,
        organizationId: 'org-1',
        outputs: 1,
        prompt: 'a plain render',
        promptId: 'prompt-2',
        referenceImageUrl: null,
        width: 1024,
      } as unknown as ImageGenerationProviderRequest);

      await provider.generate();

      expect(generateTextToImage).toHaveBeenCalledWith({
        aspectRatio: '1:1',
        batchSize: 1,
        modelKey: MODEL_KEYS.HIGGSFIELD_SOUL,
        organizationId: 'org-1',
        prompt: 'a plain render',
      });
    });
  });
});
