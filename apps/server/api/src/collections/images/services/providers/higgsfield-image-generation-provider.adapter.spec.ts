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

    it('is not resolved for other model keys', () => {
      expect(
        resolveImageGenerationProvider('klingai/v2/pro/text-to-image'),
      ).not.toBe(buildAdapter({}).provider);
    });
  });

  describe('prepare', () => {
    it('queues the text-to-image job, polls to completion, and resolves outputUrls for finalization', async () => {
      const generateTextToImage = vi
        .fn()
        .mockResolvedValue({ requestId: 'req-456' });
      const waitForImageCompletion = vi
        .fn()
        .mockResolvedValue({ imageUrl: 'https://cdn.test/out.png' });
      const adapter = buildAdapter({
        generateTextToImage,
        waitForImageCompletion,
      });

      const provider = await adapter.prepare({
        height: 1920,
        model: MODEL_KEYS.HIGGSFIELD_SOUL,
        organizationId: 'org-1',
        prompt: 'studio product shot',
        promptId: 'prompt-1',
        width: 1080,
      } as unknown as ImageGenerationProviderRequest);

      expect(provider.completionKind).toBe('poll-single');
      expect(provider.outputStrategy).toBe('single');

      const result = await provider.generate();

      expect(generateTextToImage).toHaveBeenCalledWith({
        aspectRatio: '9:16',
        organizationId: 'org-1',
        prompt: 'studio product shot',
      });
      expect(waitForImageCompletion).toHaveBeenCalledWith('req-456', {
        organizationId: 'org-1',
      });
      expect(result).toEqual({
        externalId: 'req-456',
        kind: 'external-id',
        outputUrls: ['https://cdn.test/out.png'],
        promptId: 'prompt-1',
      });
    });
  });
});
