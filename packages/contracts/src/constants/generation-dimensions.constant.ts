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

/** Long edge in pixels for each Studio resolution label. */
const STUDIO_RESOLUTION_LONG_EDGE: Readonly<Record<string, number>> = {
  '360p': 640,
  '1080P': 1920,
  '1080p': 1920,
  '1K': 1024,
  '2K': 2048,
  '480P': 854,
  '480p': 854,
  '720p': 1280,
  '768P': 1366,
  '768p': 1366,
  '4k': 3840,
  high: 1920,
  pro: 1920,
  standard: 1280,
};

const STUDIO_DEFAULT_LONG_EDGE = 1024;
const STUDIO_EDGE_MULTIPLE = 8;

function snapStudioEdge(value: number): number {
  return Math.max(
    STUDIO_EDGE_MULTIPLE,
    Math.round(value / STUDIO_EDGE_MULTIPLE) * STUDIO_EDGE_MULTIPLE,
  );
}

export function resolveStudioLongEdge(resolution: string): number {
  return STUDIO_RESOLUTION_LONG_EDGE[resolution] ?? STUDIO_DEFAULT_LONG_EDGE;
}

/**
 * Pins the long edge to `longEdge` and derives the short edge from the ratio,
 * snapped to a multiple of 8. Studio submits these dimensions, and the server
 * estimate derives the same ones, so both quote identical megapixels.
 */
export function resolveStudioAspectDimensions(
  aspectRatio: string,
  longEdge: number = STUDIO_DEFAULT_LONG_EDGE,
): GenerationExecutionDimensions {
  const [rawHorizontal, rawVertical] = aspectRatio.split(':');
  const horizontal = Number(rawHorizontal);
  const vertical = Number(rawVertical);
  if (
    !Number.isFinite(horizontal) ||
    !Number.isFinite(vertical) ||
    horizontal <= 0 ||
    vertical <= 0
  ) {
    return { height: longEdge, width: longEdge };
  }
  return horizontal >= vertical
    ? {
        height: snapStudioEdge((longEdge * vertical) / horizontal),
        width: longEdge,
      }
    : {
        height: longEdge,
        width: snapStudioEdge((longEdge * horizontal) / vertical),
      };
}

/** Executed pixel size for a Studio aspect ratio and resolution label. */
export function resolveStudioGenerationDimensions(
  aspectRatio: string,
  resolution: string,
): GenerationExecutionDimensions {
  return resolveStudioAspectDimensions(
    aspectRatio,
    resolveStudioLongEdge(resolution),
  );
}
