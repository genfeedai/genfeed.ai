import { FalVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/fal-video-generation-provider.adapter';
import type { FalService } from '@api/services/integrations/fal/services/fal.service';
import { FalSchemaFamily } from '@api/services/integrations/fal/services/fal-contract';
import { MODEL_KEYS } from '@genfeedai/constants';

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

  it.each([
    {
      endpoint: 'google/gemini-omni-flash',
      expectedInput: {
        aspect_ratio: '9:16',
        duration: 8,
        prompt: 'a musician under neon lights',
      },
      promptParams: { aspect_ratio: '9:16', duration: 8 },
    },
    {
      endpoint: 'google/gemini-omni-flash/image-to-video',
      expectedInput: {
        aspect_ratio: '9:16',
        duration: 8,
        image_url: 'https://cdn.test/start.png',
        prompt: 'a musician under neon lights',
      },
      promptParams: {
        aspect_ratio: '9:16',
        duration: 8,
        image_url: 'https://cdn.test/start.png',
      },
    },
    {
      endpoint: 'google/gemini-omni-flash/reference-to-video',
      expectedInput: {
        aspect_ratio: '9:16',
        duration: 8,
        image_urls: [
          'https://cdn.test/start.png',
          'https://cdn.test/style.png',
        ],
        prompt: 'a musician under neon lights, cinematic dolly shot',
      },
      promptParams: {
        aspect_ratio: '9:16',
        duration: 8,
        image_url: 'https://cdn.test/start.png',
        image_urls: ['https://cdn.test/style.png'],
        prompt: 'a musician under neon lights, cinematic dolly shot',
      },
    },
  ])(
    'routes Gemini Omni Flash to $endpoint without inventing schema fields',
    async ({ endpoint, expectedInput, promptParams }) => {
      const falService = {
        generateVideo: vi
          .fn()
          .mockResolvedValue({ url: 'https://cdn.test/out.mp4' }),
      };
      const adapter = new FalVideoGenerationProviderAdapter(
        falService as unknown as FalService,
      );

      await adapter.generate({
        duration: endpoint.endsWith('/image-to-video') ? 2 : 8,
        height: 1920,
        model: MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH,
        modelEndpoint: MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH,
        prompt: 'a musician under neon lights',
        promptParams,
        width: 1080,
      });

      expect(falService.generateVideo).toHaveBeenCalledWith(
        endpoint,
        expectedInput,
      );
    },
  );

  it.each([
    {
      endpoint: 'minimax/h3-max/text-to-video',
      expectedInput: {
        aspect_ratio: '21:9',
        duration: 7,
        enable_safety_checker: true,
        prompt: 'a silver airship crossing the desert',
        prompt_expansion_mode: 'quality',
        resolution: '768P',
        seed: 42,
      },
      promptParams: {
        aspect_ratio: '21:9',
        duration: 7,
        prompt_expansion_mode: 'quality',
        resolution: '768P',
        seed: 42,
      },
    },
    {
      endpoint: 'minimax/h3-max/image-to-video',
      expectedInput: {
        duration: 12,
        enable_safety_checker: true,
        end_image_url: 'https://cdn.test/end.png',
        image_url: 'https://cdn.test/start.png',
        prompt: 'a silver airship crossing the desert',
        prompt_expansion_mode: 'balanced',
        resolution: '480P',
      },
      promptParams: {
        aspect_ratio: '9:16',
        duration: 12,
        end_image_url: 'https://cdn.test/end.png',
        image_url: 'https://cdn.test/start.png',
        prompt_expansion_mode: 'balanced',
        resolution: '480P',
      },
    },
  ])(
    'routes MiniMax H3 Max to $endpoint with the published contract',
    async ({ endpoint, expectedInput, promptParams }) => {
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
        model: MODEL_KEYS.FAL_MINIMAX_H3_MAX,
        modelEndpoint: 'minimax/h3-max/text-to-video',
        prompt: 'a silver airship crossing the desert',
        promptParams,
        width: 1920,
      });

      expect(falService.generateVideo).toHaveBeenCalledWith(
        endpoint,
        expectedInput,
      );
    },
  );
});
