import type { CredentialPlatform } from '@genfeedai/contracts';
import type {
  MediaProbe,
  MediaReadinessDiagnostic,
  MediaReadinessReport,
  MediaReadinessSpecProperty,
  PlatformMediaSpec,
  PublishingDiagnosticSeverity,
} from '@genfeedai/contracts/api-types/contracts';
import {
  getPlatformMediaSpec,
  getPlatformMediaSpecs,
} from '@genfeedai/contracts/constants';
import type {
  IMediaReadinessAsset,
  IMediaReadinessEvaluationInput,
} from '@genfeedai/contracts/interfaces';

/**
 * Deterministic media readiness evaluation (#4878).
 *
 * Every limit and every block-versus-warn decision comes from the
 * `PLATFORM_MEDIA_SPECS` entry. This module only measures, compares and
 * renders — it never decides that a property is fatal. Adding a platform is a
 * seed-data change, not a change here.
 */

type DiagnosticDraft = {
  actual: string;
  code: string;
  limit: string;
  message: string;
  property: MediaReadinessSpecProperty;
};

function resolveSeverity(
  spec: PlatformMediaSpec,
  property: MediaReadinessSpecProperty,
): PublishingDiagnosticSeverity {
  return spec.severities[property] ?? spec.defaultSeverity;
}

function formatSeconds(seconds: number): string {
  return `${Math.round(seconds * 100) / 100}s`;
}

function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1024) {
    return `${Math.round((megabytes / 1024) * 100) / 100}GB`;
  }
  return `${Math.round(megabytes * 100) / 100}MB`;
}

function formatRatio(width: number, height: number): string {
  return `${Math.round((width / height) * 1000) / 1000}:1`;
}

/**
 * ffprobe reports a container as a comma-joined family
 * (`mov,mp4,m4a,3gp,3g2,mj2`). Any member matching the spec counts as a match.
 */
function readContainerNames(container: string): string[] {
  return container
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
}

function checkRange(params: {
  actual: number;
  format: (value: number) => string;
  max?: number;
  min?: number;
  noun: string;
  property: MediaReadinessSpecProperty;
}): DiagnosticDraft[] {
  const { actual, format, max, min, noun, property } = params;
  if (min !== undefined && actual < min) {
    return [
      {
        actual: format(actual),
        code: `media_${property}_below_minimum`,
        limit: `minimum ${format(min)}`,
        message: `${noun} ${format(actual)} is below the minimum of ${format(min)}.`,
        property,
      },
    ];
  }
  if (max !== undefined && actual > max) {
    return [
      {
        actual: format(actual),
        code: `media_${property}_above_maximum`,
        limit: `maximum ${format(max)}`,
        message: `${noun} ${format(actual)} exceeds the maximum of ${format(max)}.`,
        property,
      },
    ];
  }
  return [];
}

function checkAllowedValue(params: {
  actual: string;
  allowed: readonly string[];
  candidates: readonly string[];
  noun: string;
  property: MediaReadinessSpecProperty;
}): DiagnosticDraft[] {
  const { actual, allowed, candidates, noun, property } = params;
  if (allowed.length === 0) {
    return [];
  }
  if (candidates.some((candidate) => allowed.includes(candidate))) {
    return [];
  }
  return [
    {
      actual,
      code: `media_${property}_unsupported`,
      limit: allowed.join(', '),
      message: `${noun} "${actual}" is not accepted; supported: ${allowed.join(', ')}.`,
      property,
    },
  ];
}

function checkAspectRatio(
  spec: PlatformMediaSpec,
  probe: MediaProbe,
): DiagnosticDraft[] {
  if (
    spec.aspectRatios.length === 0 ||
    probe.width === null ||
    probe.height === null
  ) {
    return [];
  }

  const actualRatio = probe.width / probe.height;
  const deviations = spec.aspectRatios.map((ratio) => {
    const target = ratio.width / ratio.height;
    return {
      deviation: Math.abs(actualRatio - target) / target,
      label: ratio.label,
    };
  });
  const nearest = deviations.reduce((best, candidate) =>
    candidate.deviation < best.deviation ? candidate : best,
  );
  if (nearest.deviation <= spec.aspectRatioTolerance) {
    return [];
  }

  const accepted = spec.aspectRatios.map((ratio) => ratio.label).join(', ');
  const tolerancePercent = Math.round(spec.aspectRatioTolerance * 100);
  return [
    {
      actual: formatRatio(probe.width, probe.height),
      code: 'media_aspect_ratio_out_of_tolerance',
      limit: `${accepted} (±${tolerancePercent}%)`,
      message: `Aspect ratio ${formatRatio(probe.width, probe.height)} is outside the accepted ratios ${accepted} (±${tolerancePercent}%); nearest is ${nearest.label}.`,
      property: 'aspectRatio',
    },
  ];
}

/**
 * One spec constraint paired with the probe value that satisfies it.
 *
 * `isConstrained` false means the platform does not limit this property, so a
 * missing measurement is not worth reporting. When it is constrained and the
 * measurement is null, the check cannot run — that is reported as a `probe`
 * diagnostic rather than silently passing, so incomplete probe data never
 * reads as a clean bill of health.
 */
type MeasuredCheck = {
  isConstrained: boolean;
  isMeasured: boolean;
  noun: string;
  property: MediaReadinessSpecProperty;
  run: () => DiagnosticDraft[];
};

function missingMeasurementDraft(check: MeasuredCheck): DiagnosticDraft {
  return {
    actual: 'unknown',
    code: `media_${check.property}_not_measured`,
    limit: `${check.noun.toLowerCase()} measurement required`,
    message: `${check.noun} could not be read from this asset's probe metadata, so the platform limit was not checked.`,
    property: 'probe',
  };
}

function buildChecks(
  spec: PlatformMediaSpec,
  probe: MediaProbe,
): MeasuredCheck[] {
  return [
    {
      isConstrained: spec.maxWidth !== undefined || spec.minWidth !== undefined,
      isMeasured: probe.width !== null,
      noun: 'Width',
      property: 'width',
      run: () =>
        checkRange({
          actual: probe.width ?? 0,
          format: (value) => `${value}px`,
          max: spec.maxWidth,
          min: spec.minWidth,
          noun: 'Width',
          property: 'width',
        }),
    },
    {
      isConstrained:
        spec.maxHeight !== undefined || spec.minHeight !== undefined,
      isMeasured: probe.height !== null,
      noun: 'Height',
      property: 'height',
      run: () =>
        checkRange({
          actual: probe.height ?? 0,
          format: (value) => `${value}px`,
          max: spec.maxHeight,
          min: spec.minHeight,
          noun: 'Height',
          property: 'height',
        }),
    },
    {
      isConstrained:
        spec.maxDurationSeconds !== undefined ||
        spec.minDurationSeconds !== undefined,
      isMeasured: probe.durationSeconds !== null,
      noun: 'Duration',
      property: 'duration',
      run: () =>
        checkRange({
          actual: probe.durationSeconds ?? 0,
          format: formatSeconds,
          max: spec.maxDurationSeconds,
          min: spec.minDurationSeconds,
          noun: 'Duration',
          property: 'duration',
        }),
    },
    {
      isConstrained:
        spec.maxFileSizeBytes !== undefined ||
        spec.minFileSizeBytes !== undefined,
      isMeasured: probe.sizeBytes !== null,
      noun: 'File size',
      property: 'fileSize',
      run: () =>
        checkRange({
          actual: probe.sizeBytes ?? 0,
          format: formatBytes,
          max: spec.maxFileSizeBytes,
          min: spec.minFileSizeBytes,
          noun: 'File size',
          property: 'fileSize',
        }),
    },
    {
      isConstrained:
        spec.maxFrameRate !== undefined || spec.minFrameRate !== undefined,
      isMeasured: probe.frameRate !== null,
      noun: 'Frame rate',
      property: 'frameRate',
      run: () =>
        checkRange({
          actual: probe.frameRate ?? 0,
          format: (value) => `${Math.round(value * 100) / 100}fps`,
          max: spec.maxFrameRate,
          min: spec.minFrameRate,
          noun: 'Frame rate',
          property: 'frameRate',
        }),
    },
    {
      isConstrained: spec.containers.length > 0,
      isMeasured: probe.container !== null,
      noun: 'Container',
      property: 'container',
      run: () =>
        checkAllowedValue({
          actual: probe.container ?? '',
          allowed: spec.containers,
          candidates: readContainerNames(probe.container ?? ''),
          noun: 'Container',
          property: 'container',
        }),
    },
    {
      isConstrained: spec.videoCodecs.length > 0,
      isMeasured: probe.videoCodec !== null,
      noun: 'Video codec',
      property: 'videoCodec',
      run: () =>
        checkAllowedValue({
          actual: probe.videoCodec ?? '',
          allowed: spec.videoCodecs,
          candidates: [(probe.videoCodec ?? '').toLowerCase()],
          noun: 'Video codec',
          property: 'videoCodec',
        }),
    },
    {
      isConstrained: spec.audioCodecs.length > 0,
      isMeasured: probe.audioCodec !== null,
      noun: 'Audio codec',
      property: 'audioCodec',
      run: () =>
        checkAllowedValue({
          actual: probe.audioCodec ?? '',
          allowed: spec.audioCodecs,
          candidates: [(probe.audioCodec ?? '').toLowerCase()],
          noun: 'Audio codec',
          property: 'audioCodec',
        }),
    },
    {
      isConstrained: spec.aspectRatios.length > 0,
      isMeasured: probe.width !== null && probe.height !== null,
      noun: 'Aspect ratio',
      property: 'aspectRatio',
      run: () => checkAspectRatio(spec, probe),
    },
  ];
}

function collectDrafts(
  spec: PlatformMediaSpec,
  probe: MediaProbe,
): DiagnosticDraft[] {
  return buildChecks(spec, probe).flatMap((check) => {
    if (!check.isConstrained) {
      return [];
    }
    return check.isMeasured ? check.run() : [missingMeasurementDraft(check)];
  });
}

function toDiagnostics(params: {
  asset: IMediaReadinessAsset;
  drafts: readonly DiagnosticDraft[];
  platform: CredentialPlatform;
  spec: PlatformMediaSpec;
}): MediaReadinessDiagnostic[] {
  return params.drafts.map((draft) => ({
    actual: draft.actual,
    assetId: params.asset.assetId,
    code: draft.code,
    kind: params.asset.kind,
    limit: draft.limit,
    message: `${params.platform}: ${draft.message}`,
    platform: params.platform,
    property: draft.property,
    severity: resolveSeverity(params.spec, draft.property),
  }));
}

function evaluateAssetForPlatform(
  asset: IMediaReadinessAsset,
  platform: CredentialPlatform,
): MediaReadinessDiagnostic[] {
  const spec = getPlatformMediaSpec(platform, asset.kind);
  if (!spec) {
    // No seeded spec for this platform and media kind: nothing deterministic
    // to assert. Channel capability validation still covers kind support.
    return [];
  }

  if (!asset.probe) {
    return toDiagnostics({
      asset,
      drafts: [
        {
          actual: 'none',
          code: 'media_probe_unavailable',
          limit: 'probe metadata required',
          message:
            'No probe metadata is available for this asset, so its media limits could not be checked.',
          property: 'probe',
        },
      ],
      platform,
      spec,
    });
  }

  return toDiagnostics({
    asset,
    drafts: collectDrafts(spec, asset.probe),
    platform,
    spec,
  });
}

/** True when the platform has any seeded spec worth evaluating against. */
export function hasPlatformMediaSpecs(platform: CredentialPlatform): boolean {
  return getPlatformMediaSpecs(platform).length > 0;
}

/**
 * An attached id the tenant-scoped lookup did not return — missing, soft
 * deleted, or owned by another organization. The publish paths still hand that
 * id to the provider, so reporting nothing would let an unchecked asset read
 * as a clean result.
 *
 * Severity is fixed at `error` here rather than taken from a spec entry: this
 * is a request-integrity failure, not a platform limit, and the message stays
 * generic so it never discloses whether a cross-organization asset exists.
 */
function unresolvedAssetDiagnostics(
  assetId: string,
  platforms: readonly CredentialPlatform[],
): MediaReadinessDiagnostic[] {
  return platforms.map((platform) => ({
    actual: 'unresolved',
    assetId,
    code: 'media_asset_unresolved',
    kind: null,
    limit: 'asset must exist in this organization',
    message: `${platform}: Attached asset "${assetId}" could not be resolved, so its media limits could not be checked.`,
    platform,
    property: 'asset',
    severity: 'error',
  }));
}

export function evaluateMediaReadiness(
  input: IMediaReadinessEvaluationInput,
): MediaReadinessReport {
  const diagnostics = [
    ...input.assets.flatMap((asset) =>
      input.platforms.flatMap((platform) =>
        evaluateAssetForPlatform(asset, platform),
      ),
    ),
    ...(input.unresolvedAssetIds ?? []).flatMap((assetId) =>
      unresolvedAssetDiagnostics(assetId, input.platforms),
    ),
  ];

  return {
    checkedAt: new Date().toISOString(),
    diagnostics,
    isBlocked: diagnostics.some(
      (diagnostic) => diagnostic.severity === 'error',
    ),
  };
}

export function readBlockingDiagnostics(
  report: MediaReadinessReport,
): MediaReadinessDiagnostic[] {
  return report.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  );
}

export function readWarningDiagnostics(
  report: MediaReadinessReport,
): MediaReadinessDiagnostic[] {
  return report.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'warning',
  );
}

export function formatMediaReadinessBlockers(
  diagnostics: readonly MediaReadinessDiagnostic[],
): string {
  return diagnostics.map((diagnostic) => diagnostic.message).join(' ');
}
