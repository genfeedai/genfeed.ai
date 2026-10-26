import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';

/**
 * Throws unless the model supports the target resolution and frame rate, so a
 * quote and a charge accept exactly the same options.
 */
export function assertSupportedVideoUpscaleOptions(
  model: string,
  targetResolution: string,
  targetFps: number,
): void {
  const isTopaz = model === MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE;
  const isBytedance = model === MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER;
  if (!isTopaz && !isBytedance) {
    throw new BadRequestException(`Unsupported video upscale model: ${model}`);
  }

  const resolutions = isTopaz
    ? new Set(['720p', '1080p', '4k'])
    : new Set(['720p', '1080p', '2k', '4k']);
  if (!resolutions.has(targetResolution)) {
    throw new BadRequestException(
      `${model} does not support target resolution "${targetResolution}".`,
    );
  }

  const isSupportedFps = isTopaz
    ? Number.isInteger(targetFps) && targetFps >= 15 && targetFps <= 60
    : new Set([24, 30, 60, 120]).has(targetFps);
  if (!isSupportedFps) {
    throw new BadRequestException(
      `${model} does not support target FPS ${targetFps}.`,
    );
  }
}
