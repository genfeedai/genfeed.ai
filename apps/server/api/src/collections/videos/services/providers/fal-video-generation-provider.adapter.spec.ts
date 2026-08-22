import { FalVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/fal-video-generation-provider.adapter';
import type { FalService } from '@server/services/integrations/fal/services/fal.service';
import { FalSchemaFamily } from '@server/services/integrations/fal/services/fal-contract';

describe('FalVideoGenerationProviderAdapter reviewed contracts', () => {
  it('executes a reviewed image-to-video family through the contract adapter', async () => {
    const falService = {
      generateVideo: vi
        .fn()
        .mockResolvedValue({ url: 'https://cdn.test/out.mp4' }),
    };
    const adapter = new FalVideoGenerationProviderAdapter(
      falService as unknown as FalService,
    );

    await adapter.generate({
      duration: 5,
      height: 1080,
      imageUrl: 'https://cdn.test/start.png',
      model: 'fal/fal-ai/modern-video/image-to-video',
      modelEndpoint: 'fal-ai/modern-video/image-to-video',
      modelInputSchema: {
        properties: {
          duration: { enum: ['5', '10'], type: 'string' },
          image_url: { type: 'string' },
          prompt: { type: 'string' },
          resolution: { type: 'string' },
        },
        required: ['prompt', 'image_url'],
        type: 'object',
      },
      modelSchemaFamily: FalSchemaFamily.VIDEO_IMAGE,
      prompt: 'slow camera push',
      promptParams: { prompt: 'old', resolution: '1080p' },
      width: 1920,
    });

    expect(falService.generateVideo).toHaveBeenCalledWith(
      'fal-ai/modern-video/image-to-video',
      {
        duration: '5',
        image_url: 'https://cdn.test/start.png',
        prompt: 'slow camera push',
        resolution: '1080p',
      },
    );
  });
});
