import {
  type BrandLab,
  brandDeltaE2000,
  brandRgbToLab,
  formatBrandHexColor,
  parseBrandHexColor,
} from '@api/services/brand-validation/brand-validation-color.util';
import {
  type BrandDecodedVisual,
  decodeBrandImage,
  sampleBrandVideoFrames,
} from '@api/services/brand-validation/brand-validation-pixels.util';
import type { BrandPaletteProofV1 } from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandArtifactValidationCheckV1,
  BrandArtifactValidationInputV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

/** A pixel within this CIEDE2000 distance of the approved color counts as that color. */
export const BRAND_PALETTE_MAX_DELTA_E = 8;
/** The approved color must cover at least this share of opaque pixels to count as present. */
export const BRAND_PALETTE_MIN_COVERAGE = 0.01;
/** Fewer opaque pixels than this cannot support a pass or a fail. */
export const BRAND_PALETTE_MIN_PIXELS = 1024;
const ALPHA_THRESHOLD = 128;
const SWATCH_COUNT = 5;
const VISUAL_ROLES = ['primary', 'image', 'video'];

export interface BrandPaletteMeasurement {
  sampledFrames: number;
  analyzedPixels: number;
  swatches: { color: string; share: number }[];
  decoder: string;
  /** Share of opaque pixels within `BRAND_PALETTE_MAX_DELTA_E` of `target`. */
  measure(target: BrandLab): { coverage: number; nearestSwatchDeltaE: number };
}

const round4 = (value: number): number => Math.round(value * 10000) / 10000;
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Histograms the opaque pixels once, so every approved color is compared without a rescan. */
export function measureBrandPalette(
  visual: BrandDecodedVisual,
): BrandPaletteMeasurement | null {
  const exact = new Map<number, number>();
  const bins = new Map<
    number,
    { count: number; sum: [number, number, number] }
  >();
  let analyzedPixels = 0;
  for (const frame of visual.frames) {
    const { rgba } = frame;
    for (let offset = 0; offset + 3 < rgba.length; offset += 4) {
      if (rgba[offset + 3] < ALPHA_THRESHOLD) continue;
      const r = rgba[offset];
      const g = rgba[offset + 1];
      const b = rgba[offset + 2];
      analyzedPixels++;
      const key = (r << 16) | (g << 8) | b;
      exact.set(key, (exact.get(key) ?? 0) + 1);
      const binKey = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bin = bins.get(binKey) ?? { count: 0, sum: [0, 0, 0] };
      bin.count++;
      bin.sum[0] += r;
      bin.sum[1] += g;
      bin.sum[2] += b;
      bins.set(binKey, bin);
    }
  }
  if (analyzedPixels < BRAND_PALETTE_MIN_PIXELS) return null;
  const swatches = [...bins.entries()]
    .sort(([keyA, a], [keyB, b]) => b.count - a.count || keyA - keyB)
    .slice(0, SWATCH_COUNT)
    .map(([, bin]) => ({
      color: formatBrandHexColor([
        bin.sum[0] / bin.count,
        bin.sum[1] / bin.count,
        bin.sum[2] / bin.count,
      ]),
      share: round4(bin.count / analyzedPixels),
    }));
  const swatchLabs = swatches.map((swatch) => {
    const rgb = parseBrandHexColor(swatch.color);
    return rgb ? brandRgbToLab(rgb) : null;
  });
  const colors = [...exact.entries()].map(
    ([key, count]) =>
      [
        brandRgbToLab([(key >> 16) & 255, (key >> 8) & 255, key & 255]),
        count,
      ] as const,
  );
  return {
    analyzedPixels,
    decoder: visual.decoder,
    measure(target) {
      let matching = 0;
      for (const [lab, count] of colors)
        if (brandDeltaE2000(lab, target) <= BRAND_PALETTE_MAX_DELTA_E)
          matching += count;
      const nearest = Math.min(
        ...swatchLabs.map((lab) =>
          lab ? brandDeltaE2000(lab, target) : Number.POSITIVE_INFINITY,
        ),
      );
      return {
        coverage: round4(matching / analyzedPixels),
        nearestSwatchDeltaE: round2(Number.isFinite(nearest) ? nearest : 0),
      };
    },
    sampledFrames: visual.frames.length,
    swatches,
  };
}

type PaletteOutcome =
  | { kind: 'unknown'; reasonCode: string }
  | {
      kind: 'measured';
      measurement: BrandPaletteMeasurement;
      part: { id: string; version: string; hash: string };
    };

async function measureVisual(
  input: BrandArtifactValidationInputV1,
): Promise<PaletteOutcome> {
  const { artifact, material } = input;
  const visuals = artifact.parts.filter((part) =>
    VISUAL_ROLES.includes(part.role),
  );
  if (visuals.length !== 1)
    return { kind: 'unknown', reasonCode: 'visual_part_unavailable' };
  // A layer placed over the base changes the final pixels; the base alone proves nothing.
  if (artifact.parts.some((part) => part.role === 'overlay'))
    return { kind: 'unknown', reasonCode: 'visual_composite_unproven' };
  const descriptor = visuals[0];
  const bytes = material.parts.find(
    (part) =>
      part.partId === descriptor.id && part.partVersion === descriptor.version,
  )?.bytes;
  if (!bytes) return { kind: 'unknown', reasonCode: 'visual_part_unavailable' };
  const decoded =
    artifact.mediaKind === 'video'
      ? await sampleBrandVideoFrames(bytes)
      : await decodeBrandImage(bytes);
  if (!decoded) return { kind: 'unknown', reasonCode: 'artifact_undecodable' };
  const measurement = measureBrandPalette(decoded);
  if (!measurement) return { kind: 'unknown', reasonCode: 'visual_too_small' };
  return {
    kind: 'measured',
    measurement,
    part: {
      hash: descriptor.contentHash,
      id: descriptor.id,
      version: descriptor.version,
    },
  };
}

function unknownCheck(
  check: BrandArtifactValidationCheckV1,
  reasonCode: string,
): BrandArtifactValidationCheckV1 {
  return { ...check, reasonCode, result: 'unknown' };
}

/**
 * Replaces each applicable palette check the validator could not previously
 * prove with a deterministic result: `pass` when the approved color covers at
 * least `BRAND_PALETTE_MIN_COVERAGE` of the final artifact's opaque pixels
 * (within `BRAND_PALETTE_MAX_DELTA_E`), `fail` when it does not, and `unknown`
 * when the artifact cannot be decoded or is not a single final visual. The
 * proof binds the measurements to the artifact and part hashes. Where a color
 * is placed (its usage) is not proven.
 */
export async function proveBrandPaletteChecks(
  input: BrandArtifactValidationInputV1,
  checks: readonly BrandArtifactValidationCheckV1[],
): Promise<BrandArtifactValidationCheckV1[]> {
  const isProvable = (check: BrandArtifactValidationCheckV1) =>
    check.category === 'palette' && check.result === 'unsupported';
  if (
    input.artifact.mediaKind === 'text' ||
    !checks.some((check) => isProvable(check))
  )
    return [...checks];
  const outcome = await measureVisual(input);
  return checks.map((check) => {
    if (!isProvable(check)) return check;
    if (outcome.kind === 'unknown')
      return unknownCheck(check, outcome.reasonCode);
    const rule = input.snapshot.generationRules.palette.find(
      (candidate) => candidate.id === check.ruleId,
    );
    const target = rule ? parseBrandHexColor(rule.color) : null;
    if (!rule || !target)
      return unknownCheck(check, 'palette_color_translucent');
    const { coverage, nearestSwatchDeltaE } = outcome.measurement.measure(
      brandRgbToLab(target),
    );
    const proof: BrandPaletteProofV1 = {
      algorithm: 'ciede2000-presence-v1',
      analyzedPixels: outcome.measurement.analyzedPixels,
      artifactHash: input.artifact.contentHash,
      coverage,
      decoder: outcome.measurement.decoder,
      kind: 'palette',
      maxDeltaE: BRAND_PALETTE_MAX_DELTA_E,
      mediaKind: input.artifact.mediaKind === 'video' ? 'video' : 'image',
      minCoverage: BRAND_PALETTE_MIN_COVERAGE,
      nearestSwatchDeltaE,
      partHash: outcome.part.hash,
      partId: outcome.part.id,
      partVersion: outcome.part.version,
      sampledFrames: outcome.measurement.sampledFrames,
      swatches: outcome.measurement.swatches,
      target: formatBrandHexColor(target),
    };
    const isPresent = coverage >= BRAND_PALETTE_MIN_COVERAGE;
    const { reasonCode: _unsupported, ...rest } = check;
    return {
      ...rest,
      method: 'deterministic_render',
      proof,
      result: isPresent ? 'pass' : 'fail',
      ...(isPresent ? {} : { reasonCode: 'palette_color_absent' }),
    };
  });
}
