import type { GenerationExecutionDimensions } from '../interfaces/billing/generation-credit-calculation.interface';

/**
 * #4813 Pixel dimensions an Agent generation request executes with for each
 * aspect ratio. The Agent tool, the Agent client request body and the
 * pre-review quote all resolve through this one table so per-megapixel
 * pricing quotes the same dimensions that are charged.
 */
export const AGENT_GENERATION_ASPECT_RATIO_DIMENSIONS: Readonly<
  Record<string, GenerationExecutionDimensions>
> = {
  '1:1': { height: 1024, width: 1024 },
  '3:4': { height: 1365, width: 1024 },
  '4:3': { height: 768, width: 1024 },
  '9:16': { height: 1024, width: 576 },
  '16:9': { height: 576, width: 1024 },
};

export const DEFAULT_AGENT_IMAGE_ASPECT_RATIO = '1:1';
export const DEFAULT_AGENT_VIDEO_ASPECT_RATIO = '16:9';

/** Seconds the Agent video tool renders when no duration is supplied. */
export const DEFAULT_AGENT_VIDEO_DURATION_SECONDS = 10;

/** Unknown or missing ratios fall back to the square execution size. */
export function resolveAgentGenerationDimensions(
  aspectRatio: string | undefined,
  fallbackAspectRatio: string = DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
): GenerationExecutionDimensions {
  return (
    AGENT_GENERATION_ASPECT_RATIO_DIMENSIONS[
      aspectRatio || fallbackAspectRatio
    ] ??
    AGENT_GENERATION_ASPECT_RATIO_DIMENSIONS[DEFAULT_AGENT_IMAGE_ASPECT_RATIO]
  );
}
