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
      undefined,
      undefined,
    );
  });

  it('forwards a resolved BYOK apiKeyOverride to the Fal dispatch call (#5294)', async () => {
    const falService = {
      generateImage: vi
        .fn()
        .mockResolvedValue({ url: 'https://cdn.test/out.png' }),
    };
    const adapter = new FalImageGenerationProviderAdapter(
      falService as unknown as FalService,
    );
    const provider = await adapter.prepare({
      apiKeyOverride: 'org-fal-key',
      createImageDto: { seed: 7 },
      height: 768,
      model: 'fal/fal-ai/modern-image/edit',
      modelEndpoint: 'fal-ai/modern-image/edit',
      prompt: 'studio product shot',
      promptId: 'prompt-1',
      referenceImageUrls: ['https://cdn.test/ref.png'],
      width: 1024,
    } as unknown as ImageGenerationProviderRequest);

    await provider.generate();

    expect(falService.generateImage).toHaveBeenCalledWith(
      'fal-ai/modern-image/edit',
      expect.anything(),
      'org-fal-key',
      undefined,
    );
  });

  it('dispatches MAI-Image edit with source images and a size fal accepts', async () => {
    const falService = {
      generateImage: vi
        .fn()
        .mockResolvedValue({ url: 'https://cdn.test/out.png' }),
    };
    const adapter = new FalImageGenerationProviderAdapter(
      falService as unknown as FalService,
    );
    const provider = await adapter.prepare({
      createImageDto: {},
      height: 1024,
      model: 'fal/microsoft/mai-image-2.7/edit',
      modelEndpoint: 'microsoft/mai-image-2.7/edit',
      prompt: 'put the product in her hand',
      promptId: 'prompt-1',
      referenceImageUrls: [
        'https://cdn.test/face.png',
        'https://cdn.test/product.png',
      ],
      width: 576,
    } as unknown as ImageGenerationProviderRequest);

    await provider.generate();

    expect(falService.generateImage).toHaveBeenCalledWith(
      'microsoft/mai-image-2.7/edit',
      {
        image_size: { height: 1360, width: 768 },
        image_urls: [
          'https://cdn.test/face.png',
          'https://cdn.test/product.png',
        ],
        prompt: 'put the product in her hand',
      },
      undefined,
      undefined,
    );
  });
});
