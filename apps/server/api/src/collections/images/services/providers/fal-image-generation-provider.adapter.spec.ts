import type { ImageGenerationProviderRequest } from '@api/collections/images/services/image-generation.types';
import { FalImageGenerationProviderAdapter } from '@api/collections/images/services/providers/fal-image-generation-provider.adapter';
import type { FalService } from '@api/services/integrations/fal/services/fal.service';
import { FalSchemaFamily } from '@api/services/integrations/fal/services/fal-contract';

describe('FalImageGenerationProviderAdapter reviewed contracts', () => {
  it('executes a reviewed modern multi-image family through the contract adapter', async () => {
    const falService = {
      generateImage: vi
        .fn()
        .mockResolvedValue({ url: 'https://cdn.test/out.png' }),
    };
    const adapter = new FalImageGenerationProviderAdapter(
      falService as unknown as FalService,
    );
    const provider = await adapter.prepare({
      createImageDto: { seed: 7 },
      height: 768,
      model: 'fal/fal-ai/modern-image/edit',
      modelEndpoint: 'fal-ai/modern-image/edit',
      modelInputSchema: {
        properties: {
          image_size: { type: 'object' },
          image_urls: { items: { type: 'string' }, type: 'array' },
          prompt: { type: 'string' },
          seed: { type: 'integer' },
        },
        required: ['prompt', 'image_urls'],
        type: 'object',
      },
      modelSchemaFamily: FalSchemaFamily.IMAGE_EDIT_MULTI,
      prompt: 'studio product shot',
      promptId: 'prompt-1',
      referenceImageUrls: ['https://cdn.test/ref.png'],
      width: 1024,
    } as unknown as ImageGenerationProviderRequest);

    await provider.generate();

    expect(falService.generateImage).toHaveBeenCalledWith(
      'fal-ai/modern-image/edit',
      {
        image_size: { height: 768, width: 1024 },
        image_urls: ['https://cdn.test/ref.png'],
        prompt: 'studio product shot',
        seed: 7,
      },
    );
  });
});
