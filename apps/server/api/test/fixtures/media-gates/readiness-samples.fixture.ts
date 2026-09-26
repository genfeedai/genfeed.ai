import { evaluateMediaReadiness } from '@api/services/media-readiness/media-readiness.evaluator';
import type { CredentialPlatform } from '@genfeedai/contracts';
import type {
  MediaAspectRatio,
  MediaProbe,
  MediaReadinessKind,
  MediaReadinessSpecProperty,
  PlatformMediaSpec,
  PublishingDiagnosticSeverity,
} from '@genfeedai/contracts/api-types/contracts';
import { PLATFORM_MEDIA_SPECS } from '@genfeedai/contracts/constants';

/**
 * Over- and under-spec readiness samples (#4883), derived from the seeded
 * `PLATFORM_MEDIA_SPECS` table rather than committed media files: the
 * readiness evaluator consumes probe metadata, so a probe one step past each
 * documented limit exercises exactly what an ffmpeg-generated file would,
 * and a spec edit can never leave the fixtures behind.
 */
export interface ReadinessSample {
  /** Null for the in-spec sample, which must raise nothing. */
  expected: {
    property: MediaReadinessSpecProperty;
    severity: PublishingDiagnosticSeverity;
  } | null;
  id: string;
  kind: MediaReadinessKind;
  platform: CredentialPlatform;
  probe: MediaProbe | null;
}

export interface ReadinessSampleResult {
  isCorrect: boolean;
  sample: ReadinessSample;
  /** Properties the evaluator reported, for a miss or a false positive. */
  reported: string[];
}

const PROBED_AT = '2026-09-26T00:00:00.000Z';
const UNSUPPORTED = 'genfeed_unsupported';
const TARGET_WIDTH = 1080;
const SQUARE: MediaAspectRatio = { height: 1, label: '1:1', width: 1 };
/** Ratios far from every seeded one; the first that misses all is used. */
const EXTREME_RATIOS = [4, 0.25, 8, 0.125];

function clamp(value: number, min?: number, max?: number): number {
  return Math.min(max ?? value, Math.max(min ?? value, value));
}

function severityOf(
  spec: PlatformMediaSpec,
  property: MediaReadinessSpecProperty,
): PublishingDiagnosticSeverity {
  return spec.severities[property] ?? spec.defaultSeverity;
}

/** Dimensions on the spec's first ratio, inside every width/height bound. */
function compliantDimensions(spec: PlatformMediaSpec): {
  height: number;
  width: number;
} {
  const ratio = spec.aspectRatios[0] ?? SQUARE;
  let width = clamp(TARGET_WIDTH, spec.minWidth, spec.maxWidth);
  let height = Math.round((width * ratio.height) / ratio.width);
  const boundedHeight = clamp(height, spec.minHeight, spec.maxHeight);
  if (boundedHeight !== height) {
    height = boundedHeight;
    width = Math.round((height * ratio.width) / ratio.height);
  }
  return { height, width };
}

export function buildCompliantProbe(spec: PlatformMediaSpec): MediaProbe {
  const { height, width } = compliantDimensions(spec);
  const isVideo = spec.kind === 'video';
  return {
    audioCodec: spec.audioCodecs[0] ?? (isVideo ? 'aac' : null),
    container: spec.containers[0] ?? (isVideo ? 'mp4' : 'jpeg'),
    durationSeconds: isVideo
      ? clamp(15, spec.minDurationSeconds, spec.maxDurationSeconds)
      : null,
    frameRate: isVideo ? clamp(30, spec.minFrameRate, spec.maxFrameRate) : null,
    height,
    kind: spec.kind,
    probedAt: PROBED_AT,
    sizeBytes: Math.round(
      clamp(1024 * 1024, spec.minFileSizeBytes, spec.maxFileSizeBytes),
    ),
    videoCodec: spec.videoCodecs[0] ?? (isVideo ? 'h264' : null),
    width,
  };
}

type RangeProperty = 'duration' | 'fileSize' | 'frameRate' | 'height' | 'width';

const RANGE_FIELDS: ReadonlyArray<{
  field: 'durationSeconds' | 'frameRate' | 'height' | 'sizeBytes' | 'width';
  isInteger: boolean;
  max: keyof PlatformMediaSpec;
  min: keyof PlatformMediaSpec;
  property: RangeProperty;
}> = [
  {
    field: 'width',
    isInteger: true,
    max: 'maxWidth',
    min: 'minWidth',
    property: 'width',
  },
  {
    field: 'height',
    isInteger: true,
    max: 'maxHeight',
    min: 'minHeight',
    property: 'height',
  },
  {
    field: 'durationSeconds',
    isInteger: false,
    max: 'maxDurationSeconds',
    min: 'minDurationSeconds',
    property: 'duration',
  },
  {
    field: 'sizeBytes',
    isInteger: true,
    max: 'maxFileSizeBytes',
    min: 'minFileSizeBytes',
    property: 'fileSize',
  },
  {
    field: 'frameRate',
    isInteger: false,
    max: 'maxFrameRate',
    min: 'minFrameRate',
    property: 'frameRate',
  },
];

const ALLOWED_VALUE_FIELDS: ReadonlyArray<{
  allowed: 'audioCodecs' | 'containers' | 'videoCodecs';
  field: 'audioCodec' | 'container' | 'videoCodec';
  property: 'audioCodec' | 'container' | 'videoCodec';
}> = [
  { allowed: 'containers', field: 'container', property: 'container' },
  { allowed: 'videoCodecs', field: 'videoCodec', property: 'videoCodec' },
  { allowed: 'audioCodecs', field: 'audioCodec', property: 'audioCodec' },
];

function readLimit(
  spec: PlatformMediaSpec,
  key: keyof PlatformMediaSpec,
): number | undefined {
  const value = spec[key];
  return typeof value === 'number' ? value : undefined;
}

function extremeRatio(spec: PlatformMediaSpec): number | undefined {
  return EXTREME_RATIOS.find((candidate) =>
    spec.aspectRatios.every((ratio) => {
      const target = ratio.width / ratio.height;
      return Math.abs(candidate - target) / target > spec.aspectRatioTolerance;
    }),
  );
}

/** One compliant sample plus one sample past every limit the spec sets. */
export function buildReadinessSamplesForSpec(
  spec: PlatformMediaSpec,
): ReadinessSample[] {
  const compliant = buildCompliantProbe(spec);
  const prefix = `${spec.platform}/${spec.kind}`;
  const sample = (
    id: string,
    probe: MediaProbe | null,
    property: MediaReadinessSpecProperty | null,
  ): ReadinessSample => ({
    expected: property
      ? { property, severity: severityOf(spec, property) }
      : null,
    id: `${prefix}/${id}`,
    kind: spec.kind,
    platform: spec.platform,
    probe,
  });

  const samples: ReadinessSample[] = [sample('compliant', compliant, null)];
  for (const range of RANGE_FIELDS) {
    const max = readLimit(spec, range.max);
    const min = readLimit(spec, range.min);
    const round = range.isInteger ? Math.ceil : (value: number) => value;
    if (max !== undefined) {
      samples.push(
        sample(
          `${range.property}-above-max`,
          { ...compliant, [range.field]: round(max * 1.25) },
          range.property,
        ),
      );
    }
    if (min !== undefined) {
      samples.push(
        sample(
          `${range.property}-below-min`,
          {
            ...compliant,
            [range.field]: range.isInteger
              ? Math.max(1, Math.floor(min * 0.5))
              : min * 0.5,
          },
          range.property,
        ),
      );
    }
  }
  for (const allowed of ALLOWED_VALUE_FIELDS) {
    if (spec[allowed.allowed].length > 0) {
      samples.push(
        sample(
          `${allowed.property}-unsupported`,
          { ...compliant, [allowed.field]: UNSUPPORTED },
          allowed.property,
        ),
      );
    }
  }
  const ratio = extremeRatio(spec);
  if (spec.aspectRatios.length > 0 && ratio !== undefined) {
    samples.push(
      sample(
        'aspect-ratio-off',
        {
          ...compliant,
          height: Math.max(
            1,
            Math.round(compliantDimensions(spec).width / ratio),
          ),
        },
        'aspectRatio',
      ),
    );
  }
  samples.push(sample('probe-missing', null, 'probe'));
  return samples;
}

export function buildReadinessSamples(
  specs: readonly PlatformMediaSpec[] = PLATFORM_MEDIA_SPECS,
): ReadinessSample[] {
  return specs.flatMap(buildReadinessSamplesForSpec);
}

/**
 * Run each sample through the evaluator. A violation sample is correct when
 * its property is reported at the spec's severity (a dimension past a limit
 * may also move the aspect ratio; that extra diagnostic is expected). The
 * compliant sample is correct only when nothing at all is reported.
 */
export function scoreReadinessSamples(
  samples: readonly ReadinessSample[],
): ReadinessSampleResult[] {
  return samples.map((sample) => {
    const report = evaluateMediaReadiness({
      assets: [{ assetId: sample.id, kind: sample.kind, probe: sample.probe }],
      platforms: [sample.platform],
    });
    const reported = report.diagnostics.map(
      (diagnostic) => `${diagnostic.property}:${diagnostic.severity}`,
    );
    const expected = sample.expected;
    return {
      isCorrect: expected
        ? reported.includes(`${expected.property}:${expected.severity}`)
        : reported.length === 0,
      reported,
      sample,
    };
  });
}
