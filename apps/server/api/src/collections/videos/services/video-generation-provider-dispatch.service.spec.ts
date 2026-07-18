import type { DispatchVideoGenerationParams } from '@api/collections/videos/services/video-generation.types';
import { VideoGenerationProviderDispatchService } from '@api/collections/videos/services/video-generation-provider-dispatch.service';
import { MODEL_KEYS } from '@genfeedai/constants';
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

  const service = new VideoGenerationProviderDispatchService(
    falService as never,
    klingAIService as never,
    replicateService as never,
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

    await expect(service.dispatch(buildParams())).resolves.toBe('kling-job');

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

    await expect(service.dispatch(params)).resolves.toBe(
      'https://fal.example.com/video.mp4',
    );

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

  it('uses Replicate as the fallback with the existing prompt parameters', async () => {
    replicateService.generateTextToVideo.mockResolvedValue('replicate-job');
    const params = buildParams({ model: 'replicate/video-model' });

    await expect(service.dispatch(params)).resolves.toBe('replicate-job');

    expect(replicateService.generateTextToVideo).toHaveBeenCalledWith(
      'replicate/video-model',
      params.promptParams,
    );
    expect(falService.generateVideo).not.toHaveBeenCalled();
    expect(klingAIService.queueGenerateTextToVideo).not.toHaveBeenCalled();
  });
});
