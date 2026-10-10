import type { SeedanceVideoReferenceEvidence } from '@api/collections/videos/services/seedance-reference-evidence.util';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';

// Published output sizes: https://docs.byteplus.com/fr/docs/modelark/seedance-2-5
// The 480p landscape/portrait ceilings also cover fal's rounded 864x496 sizes.
const SIZES: Readonly<
  Record<string, Readonly<Record<string, readonly [number, number]>>>
> = {
  '480p': {
    '21:9': [992, 432],
    '16:9': [864, 496],
    '4:3': [752, 560],
    '1:1': [640, 640],
    '3:4': [560, 752],
    '9:16': [496, 864],
  },
  '720p': {
    '21:9': [1470, 630],
    '16:9': [1280, 720],
    '4:3': [1112, 834],
    '1:1': [960, 960],
    '3:4': [834, 1112],
    '9:16': [720, 1280],
  },
  '1080p': {
    '21:9': [2206, 946],
    '16:9': [1920, 1080],
    '4:3': [1664, 1248],
    '1:1': [1440, 1440],
    '3:4': [1248, 1664],
    '9:16': [1080, 1920],
  },
};

/** Internal prepared-file evidence; never accepted from a quote DTO or node dimensions. */
export interface SeedanceNativeOutputQuoteEvidence {
  endpoint: string;
  resolution: string;
  duration: number;
  sourceVersion: string;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  framesPerSecond: 24;
}

function shape(width: number, height: number): string | undefined {
  return Object.keys(SIZES['720p']).find((ratio) => {
    const [w, h] = ratio.split(':').map(Number);
    return (
      width * h === height * w ||
      Object.values(SIZES).some(
        (sizes) => sizes[ratio]?.[0] === width && sizes[ratio]?.[1] === height,
      ) ||
      (ratio === '16:9' && width === 854 && height === 480) ||
      (ratio === '9:16' && width === 480 && height === 854)
    );
  });
}

/** Adaptive extension preserves the measured source ratio; arbitrary adaptive shapes remain unpriced. */
export function prepareSeedanceNativeOutputQuote(
  endpoint: string,
  input: Readonly<Record<string, unknown>>,
  references: readonly Pick<
    SeedanceVideoReferenceEvidence,
    'sourceVersion' | 'width' | 'height'
  >[],
): SeedanceNativeOutputQuoteEvidence | undefined {
  if (
    !/^bytedance\/seedance-2\.5\/(?:us\/)?reference-to-video$/.test(endpoint) ||
    input.task !== 'extension' ||
    input.aspect_ratio !== 'auto'
  )
    return undefined;
  const reference = references.length === 1 ? references[0] : undefined;
  const resolution = input.draft === true ? '480p' : input.resolution;
  const duration =
    typeof input.duration === 'string' && /^\d+$/.test(input.duration)
      ? Number(input.duration)
      : input.duration;
  const ratio = reference
    ? shape(reference.width, reference.height)
    : undefined;
  const dimensions =
    typeof resolution === 'string' && ratio
      ? SIZES[resolution]?.[ratio]
      : undefined;
  if (
    !reference ||
    !/^[a-f0-9]{64}$/.test(reference.sourceVersion) ||
    !dimensions ||
    typeof duration !== 'number' ||
    !Number.isSafeInteger(duration) ||
    duration < 4 ||
    duration > 30
  )
    throw new BusinessLogicException(
      'Native extension requires one measured source with a published output shape and a duration from 4 to 30 seconds',
    );
  return {
    endpoint,
    resolution: String(resolution),
    duration,
    sourceVersion: reference.sourceVersion,
    sourceWidth: reference.width,
    sourceHeight: reference.height,
    width: dimensions[0],
    height: dimensions[1],
    framesPerSecond: 24,
  };
}

export function assertSeedanceNativeOutputQuote(
  input: Readonly<Record<string, unknown>>,
  evidence: SeedanceNativeOutputQuoteEvidence,
): void {
  const rebuilt = prepareSeedanceNativeOutputQuote(evidence.endpoint, input, [
    {
      sourceVersion: evidence.sourceVersion,
      width: evidence.sourceWidth,
      height: evidence.sourceHeight,
    },
  ]);
  if (!rebuilt || JSON.stringify(rebuilt) !== JSON.stringify(evidence))
    throw new BusinessLogicException('Native extension output bound changed');
}
