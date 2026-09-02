import { FalVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/fal-video-generation-provider.adapter';
import { HiggsFieldVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/higgsfield-video-generation-provider.adapter';
import { KlingAiVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/klingai-video-generation-provider.adapter';
import { ReplicateVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/replicate-video-generation-provider.adapter';
import type { DispatchVideoGenerationParams } from '@api/collections/videos/services/video-generation.types';
import { VideoGenerationProviderDispatchService } from '@api/collections/videos/services/video-generation-provider-dispatch.service';
import { ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('VideoGenerationProviderDispatchService', () => {
  const falService = {
    generateVideo: vi.fn(),
  };
  const klingAIService = {
    queueGenerateTextToVideo: vi.fn(),
  };
  const replicateService = {
    generateTextToVideo: vi.fn(),
  };
  const higgsFieldService = {
    generateImageToVideo: vi.fn(),
    waitForCompletion: vi.fn(),
  };

  const service = new VideoGenerationProviderDispatchService(
    new KlingAiVideoGenerationProviderAdapter(klingAIService as never),
    new FalVideoGenerationProviderAdapter(falService as never),
    new ReplicateVideoGenerationProviderAdapter(replicateService as never),
    new HiggsFieldVideoGenerationProviderAdapter(higgsFieldService as never),
  );

  const buildParams = (
    overrides: Partial<DispatchVideoGenerationParams> = {},
  ): DispatchVideoGenerationParams => ({
    duration: 8,
    height: 1080,
    imageUrl: 'https://cdn.example.com/reference.png',
    model: MODEL_KEYS.KLINGAI_V2,
    prompt: 'A cinematic sunrise',
    promptParams: {
      prompt: 'A cinematic sunrise',
      resolution: '1080p',
    },
    width: 1920,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes KlingAI models with the existing queue payload', async () => {
    klingAIService.queueGenerateTextToVideo.mockResolvedValue('kling-job');

    await expect(service.dispatch(buildParams())).resolves.toEqual({
      completion: 'polling',
      externalId: 'kling-job',
      provider: 'klingai',
    });

    expect(klingAIService.queueGenerateTextToVideo).toHaveBeenCalledWith(
      'A cinematic sunrise',
      {
        height: 1080,
        model: MODEL_KEYS.KLINGAI_V2,
        width: 1920,
      },
    );
    expect(falService.generateVideo).not.toHaveBeenCalled();
    expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
  });

  it('routes FAL models and normalizes the returned URL', async () => {
    falService.generateVideo.mockResolvedValue({
      url: 'https://fal.example.com/video.mp4',
    });
    const params = buildParams({ model: MODEL_KEYS.FAL_VEO_3_1 });

    await expect(service.dispatch(params)).resolves.toEqual({
      completion: 'remote-output',
      externalId: 'https://fal.example.com/video.mp4',
      provider: 'fal',
    });

    expect(falService.generateVideo).toHaveBeenCalledWith(
      MODEL_KEYS.FAL_VEO_3_1,
      {
        duration: 8,
        image_url: 'https://cdn.example.com/reference.png',
        prompt: 'A cinematic sunrise',
      },
    );
    expect(klingAIService.queueGenerateTextToVideo).not.toHaveBeenCalled();
    expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
  });

  it('omits absent optional FAL inputs', async () => {
    falService.generateVideo.mockResolvedValue({ url: 'fal-job' });

    await service.dispatch(
      buildParams({
        duration: undefined,
        imageUrl: undefined,
        model: MODEL_KEYS.FAL_PIXVERSE_V6,
      }),
    );

    expect(falService.generateVideo).toHaveBeenCalledWith(
      MODEL_KEYS.FAL_PIXVERSE_V6,
      {
        prompt: 'A cinematic sunrise',
      },
    );
  });

  it('routes a non-prefix Fal partner endpoint by provider identity', async () => {
    falService.generateVideo.mockResolvedValue({
      url: 'https://fal.example.com/h3.mp4',
    });

    await service.dispatch(
      buildParams({
        model: 'fal/minimax/h3/text-to-video',
        modelEndpoint: 'minimax/h3/text-to-video',
        modelProvider: ModelProvider.FAL,
      }),
    );

    expect(falService.generateVideo).toHaveBeenCalledWith(
      'minimax/h3/text-to-video',
      expect.objectContaining({ prompt: 'A cinematic sunrise' }),
    );
    expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
  });

  it('keeps a colliding endpoint on Replicate when its provider is Replicate', async () => {
    replicateService.generateTextToVideo.mockResolvedValue('replicate-job');

    await service.dispatch(
      buildParams({
        model: 'minimax/h3/text-to-video',
        modelEndpoint: 'minimax/h3/text-to-video',
        modelProvider: ModelProvider.REPLICATE,
      }),
    );

    expect(replicateService.generateTextToVideo).toHaveBeenCalledWith(
      'minimax/h3/text-to-video',
      expect.any(Object),
    );
    expect(falService.generateVideo).not.toHaveBeenCalled();
  });

  it('uses Replicate as the fallback with the existing prompt parameters', async () => {
    replicateService.generateTextToVideo.mockResolvedValue('replicate-job');
    const params = buildParams({ model: 'replicate/video-model' });

    await expect(service.dispatch(params)).resolves.toEqual({
      completion: 'polling',
      externalId: 'replicate-job',
      provider: 'replicate',
    });

    expect(replicateService.generateTextToVideo).toHaveBeenCalledWith(
      'replicate/video-model',
      params.promptParams,
    );
    expect(falService.generateVideo).not.toHaveBeenCalled();
    expect(klingAIService.queueGenerateTextToVideo).not.toHaveBeenCalled();
  });

  it('routes Higgsfield Kling video and resolves the polled video URL', async () => {
    higgsFieldService.generateImageToVideo.mockResolvedValue({
      requestId: 'higgsfield-req-1',
    });
    higgsFieldService.waitForCompletion.mockResolvedValue({
      videoUrl: 'https://higgsfield.example.com/video.mp4',
    });
    const params = buildParams({
      model: MODEL_KEYS.HIGGSFIELD_KLING_VIDEO,
      organizationId: 'org-1',
    });

    await expect(service.dispatch(params)).resolves.toEqual({
      completion: 'remote-output',
      externalId: 'https://higgsfield.example.com/video.mp4',
      provider: 'higgsfield',
    });

    expect(higgsFieldService.generateImageToVideo).toHaveBeenCalledWith({
      aspectRatio: '16:9',
      duration: 8,
      imageUrl: 'https://cdn.example.com/reference.png',
      modelId: MODEL_KEYS.HIGGSFIELD_KLING_VIDEO,
      organizationId: 'org-1',
      prompt: 'A cinematic sunrise',
    });
    expect(higgsFieldService.waitForCompletion).toHaveBeenCalledWith(
      'higgsfield-req-1',
      { organizationId: 'org-1' },
    );
    expect(falService.generateVideo).not.toHaveBeenCalled();
    expect(klingAIService.queueGenerateTextToVideo).not.toHaveBeenCalled();
    expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
  });
});
