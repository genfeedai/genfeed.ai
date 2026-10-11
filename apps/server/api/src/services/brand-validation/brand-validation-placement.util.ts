import type { BrandArtifactVisual } from '@api/services/brand-validation/brand-validation-visual.util';
import type {
  BrandDetectedRegion,
  BrandDetectionOutcome,
  BrandVisualAnalysis,
} from '@api/services/brand-validation/brand-visual-analysis.types';
import type { BrandPlacementProofV1 } from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandArtifactValidationCheckV1,
  BrandArtifactValidationInputV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import sharp, { type Sharp } from 'sharp';

/** A detected region is compared with the approved asset only at or above this confidence. */
export const BRAND_PLACEMENT_MIN_DETECTION_SCORE = 0.3;
/** A region matches the approved asset at or above this zero-mean normalized correlation. */
export const BRAND_PLACEMENT_MIN_SIMILARITY = 0.7;
const MAX_REGIONS_PER_FRAME = 5;
const MAX_MATCHES = 8;
const COMPARE_EDGE = 32;

type Placement = { query: string; category: 'logo' | 'product_identity' };

/** The queries for the asset checks the capability pass left unsupported. */
function placementOf(check: BrandArtifactValidationCheckV1): Placement | null {
  if (check.result !== 'unsupported') return null;
  if (
    check.category === 'logo' &&
    check.reasonCode === 'exact_logo_unavailable'
  )
    return { category: 'logo', query: 'logo' };
  if (
    check.category === 'product_identity' &&
    check.reasonCode === 'exact_product_unavailable'
  )
    return { category: 'product_identity', query: 'product' };
  return null;
}

function unknownCheck(
  check: BrandArtifactValidationCheckV1,
  reasonCode: string,
): BrandArtifactValidationCheckV1 {
  return { ...check, reasonCode, result: 'unknown' };
}

async function grayscale(source: Sharp): Promise<Float64Array | null> {
  try {
    const { data } = await source
      .flatten({ background: '#ffffff' })
      .resize(COMPARE_EDGE, COMPARE_EDGE, { fit: 'fill', kernel: 'nearest' })
      .toColourspace('b-w')
      .raw()
      .toBuffer({ resolveWithObject: true });
    return Float64Array.from(data);
  } catch {
    return null;
  }
}

/** Zero-mean normalized correlation of two equally sized pixel arrays, clamped to 0..1. */
export function brandPixelSimilarity(a: Float64Array, b: Float64Array): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < a.length; index++) {
    const da = a[index] - meanA;
    const db = b[index] - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  // A flat region or reference carries no structure to match.
  if (varianceA === 0 || varianceB === 0) return 0;
  const correlation = covariance / Math.sqrt(varianceA * varianceB);
  return Math.max(0, Math.min(1, correlation));
}

async function similarityOfRegion(
  frame: Uint8Array,
  region: BrandDetectedRegion,
  reference: Float64Array,
): Promise<number> {
  try {
    const { width = 0, height = 0 } = await sharp(
      Buffer.from(frame),
    ).metadata();
    if (!width || !height) return 0;
    const left = Math.max(0, Math.floor(region.box.x * width));
    const top = Math.max(0, Math.floor(region.box.y * height));
    const right = Math.min(
      width,
      Math.ceil((region.box.x + region.box.width) * width),
    );
    const bottom = Math.min(
      height,
      Math.ceil((region.box.y + region.box.height) * height),
    );
    if (right - left < 2 || bottom - top < 2) return 0;
    const crop = await grayscale(
      sharp(Buffer.from(frame)).extract({
        height: bottom - top,
        left,
        top,
        width: right - left,
      }),
    );
    return crop ? brandPixelSimilarity(crop, reference) : 0;
  } catch {
    return 0;
  }
}

/**
 * Decides the approved logo and product assets of an image or video from regions
 * an open-vocabulary detector proposes in the final pixels. A detector proposing
 * a region says only that something logo-like is there, so each candidate is
 * compared with the approved asset's own pixels; only a region that matches is
 * evidence. Missing a logo is not evidence of its absence, so there is no fail:
 *
 * - a candidate matches the approved asset: `pass`
 * - nothing detected, or no candidate matches: `unknown`
 *
 * A disabled or unavailable analysis, a missing reference, an undecodable
 * artifact or one that is not a single final visual leaves the check `unknown`.
 */
export async function proveBrandPlacementChecks(
  input: BrandArtifactValidationInputV1,
  checks: readonly BrandArtifactValidationCheckV1[],
  visual: BrandArtifactVisual,
  analysis: BrandVisualAnalysis | undefined,
): Promise<BrandArtifactValidationCheckV1[]> {
  if (
    input.artifact.mediaKind === 'text' ||
    !analysis ||
    !checks.some((check) => placementOf(check))
  )
    return [...checks];
  const { selection } = visual;
  const settle = (reasonCode: string) =>
    checks.map((check) =>
      placementOf(check) ? unknownCheck(check, reasonCode) : check,
    );
  if (selection.kind === 'unknown') return settle(selection.reasonCode);
  // The approved reference comes first: no reference, no paid call and no decode.
  const references = new Map<string, Float64Array>();
  for (const check of checks) {
    if (!placementOf(check)) continue;
    const reference = input.material.references.find(
      (candidate) => candidate.assetReferenceId === check.ruleId,
    );
    const asset = input.snapshot.generationRules.assets.find(
      (candidate) => candidate.id === check.ruleId,
    );
    if (!reference || !asset?.contentHash) continue;
    const pixels = await grayscale(sharp(Buffer.from(reference.bytes)));
    if (pixels) references.set(check.ruleId, pixels);
  }
  const queries = new Set(
    checks.flatMap((check) => {
      const placement = placementOf(check);
      return placement && references.has(check.ruleId) ? [placement.query] : [];
    }),
  );
  const outcomes = new Map<string, BrandDetectionOutcome>();
  let encoded: Awaited<ReturnType<BrandArtifactVisual['analysisFrames']>> =
    null;
  if (queries.size > 0) {
    encoded = await visual.analysisFrames();
    if (!encoded) return settle('artifact_undecodable');
    const scope = {
      brandId: input.snapshot.brandId,
      organizationId: input.snapshot.organizationId,
    };
    for (const query of queries)
      outcomes.set(
        query,
        await analysis.detectRegions({ frames: encoded.frames, query, scope }),
      );
  }
  const results: BrandArtifactValidationCheckV1[] = [];
  for (const check of checks) {
    const placement = placementOf(check);
    if (!placement) {
      results.push(check);
      continue;
    }
    const referencePixels = references.get(check.ruleId);
    const asset = input.snapshot.generationRules.assets.find(
      (candidate) => candidate.id === check.ruleId,
    );
    if (!referencePixels || !asset?.contentHash || !encoded) {
      results.push(unknownCheck(check, 'reference_unavailable'));
      continue;
    }
    const outcome = outcomes.get(placement.query);
    if (!outcome || outcome.status === 'unavailable') {
      results.push(unknownCheck(check, 'visual_analysis_unavailable'));
      continue;
    }
    if (outcome.status === 'disabled') {
      results.push(unknownCheck(check, 'visual_analysis_disabled'));
      continue;
    }
    if (outcome.frames.length !== encoded.frames.length) {
      results.push(unknownCheck(check, 'visual_analysis_unavailable'));
      continue;
    }
    const matches: BrandPlacementProofV1['matches'] = [];
    let hasCandidates = false;
    for (const [frame, regions] of outcome.frames.entries()) {
      const candidates = regions
        .filter((region) => region.score >= BRAND_PLACEMENT_MIN_DETECTION_SCORE)
        .slice(0, MAX_REGIONS_PER_FRAME);
      for (const region of candidates) {
        hasCandidates = true;
        const similarity = await similarityOfRegion(
          encoded.frames[frame],
          region,
          referencePixels,
        );
        if (similarity >= BRAND_PLACEMENT_MIN_SIMILARITY)
          matches.push({
            box: region.box,
            frame,
            score: region.score,
            similarity: Math.round(similarity * 10000) / 10000,
          });
      }
    }
    if (matches.length === 0) {
      results.push(
        unknownCheck(
          check,
          hasCandidates ? 'placement_unmatched' : 'placement_not_found',
        ),
      );
      continue;
    }
    matches.sort((a, b) => b.similarity - a.similarity);
    const proof: BrandPlacementProofV1 = {
      algorithm: 'detect-then-match-v1',
      artifactHash: input.artifact.contentHash,
      decoder: encoded.decoder,
      kind: 'placement',
      matches: matches.slice(0, MAX_MATCHES),
      mediaKind: selection.part.mediaKind,
      minDetectionScore: BRAND_PLACEMENT_MIN_DETECTION_SCORE,
      minSimilarity: BRAND_PLACEMENT_MIN_SIMILARITY,
      partHash: selection.part.hash,
      partId: selection.part.id,
      partVersion: selection.part.version,
      provider: outcome.provider,
      query: placement.query,
      referenceAssetId: asset.assetId,
      referenceHash: asset.contentHash,
      sampledFrames: encoded.frames.length,
    };
    const { reasonCode: _unsupported, ...rest } = check;
    results.push({
      ...rest,
      evaluatorId: `${outcome.provider.id}:${outcome.provider.model}`,
      method: 'deterministic_render',
      proof,
      result: 'pass',
    });
  }
  return results;
}
