import { ReplicateVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/replicate-video-generation-provider.adapter';
import type { DispatchVideoGenerationParams } from '@api/collections/videos/services/video-generation.types';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ErrorCode } from '@genfeedai/enums';
import { HttpException, HttpStatus } from '@nestjs/common';

function buildParams(
  overrides: Partial<DispatchVideoGenerationParams> = {},
): DispatchVideoGenerationParams {
  return {
    duration: 6,
    height: 1080,
    model: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
    prompt: 'A cinematic product reveal',
    promptParams: {
      prompt: 'A cinematic product reveal',
    },
    width: 1920,
    ...overrides,
  };
}

describe('ReplicateVideoGenerationProviderAdapter Hailuo first-frame', () => {
  it('rejects Hailuo 2.3 Fast without first_frame_image before runModel', async () => {
    const replicateService = {
      generateTextToVideo: vi.fn().mockResolvedValue('pred_should_not_run'),
    };
    const adapter = new ReplicateVideoGenerationProviderAdapter(
      replicateService as unknown as ReplicateService,
    );

    let thrown: unknown;
    try {
      await adapter.generate(buildParams());
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    const httpError = thrown as HttpException;
    expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(httpError.getResponse()).toEqual(
      expect.objectContaining({
        code: ErrorCode.VALIDATION_FAILED,
        detail: expect.stringContaining('first_frame_image'),
        title: 'Validation failed',
      }),
    );
    expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
  });

  it('rejects an invalid first_frame_image URI before runModel', async () => {
    const replicateService = {
      generateTextToVideo: vi.fn().mockResolvedValue('pred_should_not_run'),
    };
    const adapter = new ReplicateVideoGenerationProviderAdapter(
      replicateService as unknown as ReplicateService,
    );

    await expect(
      adapter.generate(
        buildParams({
          promptParams: {
            first_frame_image: 'local-frame.jpg',
            prompt: 'A cinematic product reveal',
          },
        }),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(replicateService.generateTextToVideo).not.toHaveBeenCalled();
  });

  it('dispatches Hailuo 2.3 Fast when first_frame_image is a valid URI', async () => {
    const replicateService = {
      generateTextToVideo: vi.fn().mockResolvedValue('pred_hailuo'),
    };
    const adapter = new ReplicateVideoGenerationProviderAdapter(
      replicateService as unknown as ReplicateService,
    );
    const promptParams = {
      first_frame_image: 'https://cdn.example.com/first-frame.jpg',
      prompt: 'A cinematic product reveal',
    };

    await expect(
      adapter.generate(buildParams({ promptParams })),
    ).resolves.toEqual({
      completion: 'polling',
      externalId: 'pred_hailuo',
      provider: 'replicate',
    });
    expect(replicateService.generateTextToVideo).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
      promptParams,
    );
  });
});
